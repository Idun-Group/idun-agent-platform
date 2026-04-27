"""``/admin/api/v1/agent`` router.

Singleton routes (no id in the URL) for the standalone agent. ``GET``
returns the current row, ``PATCH`` updates metadata only. Heavy fields
like the base engine config and the lifecycle status are not patchable
through this endpoint, so the only way to change framework or agent
type is to edit the YAML and restart the process.

The PATCH response uses the standard mutation envelope. The reload
field is a placeholder that always reports ``restart_required`` until
the reload service lands. That keeps the response shape stable across
the rest of the rework.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneAgentPatch,
    StandaloneAgentRead,
    StandaloneErrorCode,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow

router = APIRouter(prefix="/admin/api/v1/agent", tags=["admin", "agent"])

logger = get_logger(__name__)

_PLACEHOLDER_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RESTART_REQUIRED,
    message="Saved. Restart required to apply.",
)


async def _load_agent(session: AsyncSession) -> StandaloneAgentRow:
    """Return the singleton agent row or raise 404 in the admin envelope."""
    logger.debug("admin.agent.load start")
    row = (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()
    if row is None:
        logger.debug("admin.agent.load missing")
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=(
                    "Standalone is not configured. "
                    "Seed via IDUN_CONFIG_PATH at first boot."
                ),
            ),
        )
    logger.debug("admin.agent.load hit id=%s name=%s", row.id, row.name)
    return row


@router.get("", response_model=StandaloneAgentRead)
async def get_agent(session: SessionDep) -> StandaloneAgentRead:
    """Return the current singleton agent."""
    logger.debug("admin.agent.get start")
    row = await _load_agent(session)
    logger.info("admin.agent.get id=%s", row.id)
    return StandaloneAgentRead.model_validate(row)


@router.patch("", response_model=StandaloneMutationResponse[StandaloneAgentRead])
async def patch_agent(
    body: StandaloneAgentPatch, session: SessionDep
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Update metadata fields on the singleton agent.

    Only the fields explicitly present in the request body are applied,
    so unset fields are left untouched. An empty body is a no op and
    still returns the current row with the placeholder reload result.
    """
    fields = body.model_fields_set
    logger.debug("admin.agent.patch start fields=%s", sorted(fields))

    row = await _load_agent(session)

    if not fields:
        logger.info("admin.agent.patch noop id=%s", row.id)
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=_PLACEHOLDER_RELOAD,
        )

    for field in fields:
        setattr(row, field, getattr(body, field))
    logger.debug("admin.agent.patch staged id=%s fields=%s", row.id, sorted(fields))

    await session.commit()
    logger.debug("admin.agent.patch committed id=%s", row.id)

    await session.refresh(row)

    logger.info(
        "admin.agent.patch id=%s name=%s fields=%s",
        row.id,
        row.name,
        sorted(fields),
    )

    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=_PLACEHOLDER_RELOAD,
    )
