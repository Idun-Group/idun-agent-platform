"""``/admin/api/v1/guardrails`` router.

Collection routes for configured guardrails. Each row is one attached
guard with a ``position`` (``input`` or ``output``) and a
``sort_order`` so the engine can fire them in the operator chosen
sequence. POST creates with an auto derived slug, PATCH applies a
shallow update, DELETE removes a row. Slug stays stable on rename.

Mutating handlers run under the reload pipeline. Disabled rows are
skipped at engine config assembly so the operator can pause a guard
without deleting it.
"""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneDeleteResult,
    StandaloneErrorCode,
    StandaloneFieldError,
    StandaloneGuardrailCreate,
    StandaloneGuardrailPatch,
    StandaloneGuardrailRead,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.guardrail import (
    StandaloneGuardrailRow,
)
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)

router = APIRouter(prefix="/admin/api/v1/guardrails", tags=["admin"])

logger = get_logger(__name__)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)

_GUARDRAILS_API_KEY_ENV = "GUARDRAILS_API_KEY"


def _propagate_api_key(guardrail: object | None) -> None:
    """Mirror the body provided api_key into the process env.

    The schema lib's ``convert_guardrail`` reads ``GUARDRAILS_API_KEY``
    unconditionally during assembly. When the operator supplies the
    api_key on the row body instead of the env, we forward it here so
    the conversion call inside the reload pipeline finds a value.
    """
    if guardrail is None:
        return
    api_key = getattr(guardrail, "api_key", None)
    if api_key:
        os.environ[_GUARDRAILS_API_KEY_ENV] = api_key
        logger.info("admin.guardrails.api_key set from request body")


def _to_read(row: StandaloneGuardrailRow) -> StandaloneGuardrailRead:
    """Translate the row into the wire model."""
    return StandaloneGuardrailRead.model_validate(
        {
            "id": row.id,
            "slug": row.slug,
            "name": row.name,
            "enabled": row.enabled,
            "position": row.position,
            "sort_order": row.sort_order,
            "guardrail": row.guardrail_config,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    )


async def _load_by_id(
    session: AsyncSession, guardrail_id: UUID
) -> StandaloneGuardrailRow:
    row = (
        await session.execute(
            select(StandaloneGuardrailRow).where(
                StandaloneGuardrailRow.id == str(guardrail_id)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=f"No guardrail with id {guardrail_id}.",
            ),
        )
    return row


@router.get("", response_model=list[StandaloneGuardrailRead])
async def list_guardrails(
    session: SessionDep,
) -> list[StandaloneGuardrailRead]:
    """Return all guardrail rows ordered by position then sort_order."""
    rows = (
        (
            await session.execute(
                select(StandaloneGuardrailRow).order_by(
                    StandaloneGuardrailRow.position,
                    StandaloneGuardrailRow.sort_order,
                    StandaloneGuardrailRow.created_at,
                )
            )
        )
        .scalars()
        .all()
    )
    return [_to_read(row) for row in rows]


@router.post(
    "",
    response_model=StandaloneMutationResponse[StandaloneGuardrailRead],
    status_code=http_status.HTTP_201_CREATED,
)
async def create_guardrail(
    body: StandaloneGuardrailCreate,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneGuardrailRead]:
    """Create a new guardrail row.

    Slug is derived from ``name`` and made unique with numeric
    suffixes on collision. Empty post normalization slug returns 422.
    """
    try:
        candidate = normalize_slug(body.name)
    except SlugNormalizationError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Cannot derive a slug from the provided name.",
                field_errors=[
                    StandaloneFieldError(field="name", message=str(exc), code="invalid")
                ],
            ),
        ) from exc

    try:
        slug = await ensure_unique_slug(
            session,
            StandaloneGuardrailRow,
            StandaloneGuardrailRow.slug,
            candidate,
        )
    except SlugConflictError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_409_CONFLICT,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.CONFLICT,
                message=str(exc),
            ),
        ) from exc

    _propagate_api_key(body.guardrail)

    row = StandaloneGuardrailRow(
        slug=slug,
        name=body.name,
        enabled=body.enabled,
        position=body.position,
        sort_order=body.sort_order,
        guardrail_config=body.guardrail.model_dump(exclude_none=True),
    )
    session.add(row)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.guardrails.create id=%s slug=%s position=%s status=%s",
        row.id,
        row.slug,
        row.position,
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.get("/{guardrail_id}", response_model=StandaloneGuardrailRead)
async def get_guardrail(
    guardrail_id: UUID, session: SessionDep
) -> StandaloneGuardrailRead:
    """Return a single guardrail row or 404."""
    row = await _load_by_id(session, guardrail_id)
    return _to_read(row)


@router.patch(
    "/{guardrail_id}",
    response_model=StandaloneMutationResponse[StandaloneGuardrailRead],
)
async def patch_guardrail(
    guardrail_id: UUID,
    body: StandaloneGuardrailPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneGuardrailRead]:
    """Apply a shallow update to an existing guardrail row.

    Only fields present in the body are touched. Slug is sticky on
    rename so existing references stay valid. Inner ``guardrail`` is
    replaced wholesale when provided. Reordering happens via
    ``sort_order``.
    """
    fields = body.model_fields_set
    row = await _load_by_id(session, guardrail_id)

    if not fields:
        logger.debug("admin.guardrails.patch noop id=%s", row.id)
        return StandaloneMutationResponse(data=_to_read(row), reload=_NOOP_RELOAD)

    if "guardrail" in fields:
        _propagate_api_key(body.guardrail)

    async with reload_service._reload_mutex:
        if "name" in fields and body.name is not None:
            row.name = body.name
        if "enabled" in fields and body.enabled is not None:
            row.enabled = body.enabled
        if "position" in fields and body.position is not None:
            row.position = body.position
        if "sort_order" in fields and body.sort_order is not None:
            row.sort_order = body.sort_order
        if "guardrail" in fields and body.guardrail is not None:
            row.guardrail_config = body.guardrail.model_dump(exclude_none=True)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.guardrails.patch id=%s fields=%s status=%s",
        row.id,
        sorted(fields),
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "/{guardrail_id}",
    response_model=StandaloneMutationResponse[StandaloneDeleteResult],
)
async def delete_guardrail(
    guardrail_id: UUID,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneDeleteResult]:
    """Remove a guardrail row.

    Engine assembly drops the row from the active set. If no enabled
    rows remain, the engine continues without a guardrails layer.
    """
    row = await _load_by_id(session, guardrail_id)
    row_id = row.id

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info(
        "admin.guardrails.delete id=%s status=%s",
        row_id,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneDeleteResult(id=UUID(row_id)),
        reload=result,
    )
