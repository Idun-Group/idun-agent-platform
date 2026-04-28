"""``/admin/api/v1/prompts`` router.

Append only versioned collection. POST with an existing ``promptId``
creates the next version automatically. PATCH only accepts ``tags``;
content changes always go through a new POST so version history is
preserved. DELETE removes a single version row.

At engine config assembly the latest version per ``promptId`` is
selected, so the engine sees one prompt per logical id even though
the DB stores the full history.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneDeleteResult,
    StandaloneErrorCode,
    StandaloneMutationResponse,
    StandalonePromptCreate,
    StandalonePromptPatch,
    StandalonePromptRead,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.prompt import StandalonePromptRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload

router = APIRouter(prefix="/admin/api/v1/prompts", tags=["admin"])

logger = get_logger(__name__)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandalonePromptRow) -> StandalonePromptRead:
    """Translate the row into the wire model."""
    return StandalonePromptRead.model_validate(row)


async def _load_by_id(
    session: AsyncSession, prompt_row_id: UUID
) -> StandalonePromptRow:
    row = (
        await session.execute(
            select(StandalonePromptRow).where(
                StandalonePromptRow.id == str(prompt_row_id)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=f"No prompt version with id {prompt_row_id}.",
            ),
        )
    return row


async def _next_version(session: AsyncSession, prompt_id: str) -> int:
    """Return the next version for a logical prompt id.

    Runs under ``_reload_mutex`` so two concurrent POSTs cannot allocate
    the same version. SQLite + Postgres both honour the
    ``UniqueConstraint(prompt_id, version)`` if a race somehow slips
    through, which surfaces as a 409 instead of silent overwrite.
    """
    current = (
        await session.execute(
            select(func.max(StandalonePromptRow.version)).where(
                StandalonePromptRow.prompt_id == prompt_id
            )
        )
    ).scalar()
    return (current or 0) + 1


@router.get("", response_model=list[StandalonePromptRead])
async def list_prompts(
    session: SessionDep,
) -> list[StandalonePromptRead]:
    """Return all prompt versions ordered by prompt id then version."""
    rows = (
        await session.execute(
            select(StandalonePromptRow).order_by(
                StandalonePromptRow.prompt_id,
                StandalonePromptRow.version.desc(),
            )
        )
    ).scalars().all()
    return [_to_read(row) for row in rows]


@router.post(
    "",
    response_model=StandaloneMutationResponse[StandalonePromptRead],
    status_code=http_status.HTTP_201_CREATED,
)
async def create_prompt(
    body: StandalonePromptCreate,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandalonePromptRead]:
    """Create a new prompt version.

    First write for a given ``promptId`` is version 1. Subsequent POSTs
    with the same ``promptId`` allocate the next version. The whole
    SELECT MAX + INSERT runs under ``_reload_mutex`` so concurrent
    admin POSTs serialize.
    """
    async with reload_service._reload_mutex:
        version = await _next_version(session, body.prompt_id)
        row = StandalonePromptRow(
            prompt_id=body.prompt_id,
            version=version,
            content=body.content,
            tags=list(body.tags),
        )
        session.add(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.prompts.create id=%s prompt_id=%s version=%d status=%s",
        row.id,
        row.prompt_id,
        row.version,
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.get("/{prompt_row_id}", response_model=StandalonePromptRead)
async def get_prompt(
    prompt_row_id: UUID, session: SessionDep
) -> StandalonePromptRead:
    """Return a single prompt version row or 404."""
    row = await _load_by_id(session, prompt_row_id)
    return _to_read(row)


@router.patch(
    "/{prompt_row_id}",
    response_model=StandaloneMutationResponse[StandalonePromptRead],
)
async def patch_prompt(
    prompt_row_id: UUID,
    body: StandalonePromptPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandalonePromptRead]:
    """Update tags on an existing prompt version.

    Content changes are not accepted; clients POST a new version
    instead. Empty body is a no op (no DB write, no reload).
    """
    fields = body.model_fields_set
    row = await _load_by_id(session, prompt_row_id)

    if not fields:
        logger.debug("admin.prompts.patch noop id=%s", row.id)
        return StandaloneMutationResponse(data=_to_read(row), reload=_NOOP_RELOAD)

    async with reload_service._reload_mutex:
        if "tags" in fields and body.tags is not None:
            row.tags = list(body.tags)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.prompts.patch id=%s prompt_id=%s version=%d fields=%s status=%s",
        row.id,
        row.prompt_id,
        row.version,
        sorted(fields),
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "/{prompt_row_id}",
    response_model=StandaloneMutationResponse[StandaloneDeleteResult],
)
async def delete_prompt(
    prompt_row_id: UUID,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneDeleteResult]:
    """Remove a single prompt version.

    Deleting the latest version of a logical prompt promotes the
    previous version at the next assembly. Deleting all versions
    drops that prompt from the engine config entirely.
    """
    row = await _load_by_id(session, prompt_row_id)
    row_id = row.id
    prompt_id = row.prompt_id
    version = row.version

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info(
        "admin.prompts.delete id=%s prompt_id=%s version=%d status=%s",
        row_id,
        prompt_id,
        version,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneDeleteResult(id=UUID(row_id)),
        reload=result,
    )
