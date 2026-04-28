"""``/admin/api/v1/integrations`` router.

Collection routes for configured integrations. POST creates a row
with an auto derived slug, PATCH applies a shallow update, DELETE
removes a row. Slug is sticky on rename so URLs stay stable for
clients.

The row level ``enabled`` flag is the single source of truth at
engine config assembly: only enabled rows are included, and the
inner ``IntegrationConfig.enabled`` is overwritten to true so the
admin toggle always wins. Mutating handlers run under the reload
pipeline.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneDeleteResult,
    StandaloneErrorCode,
    StandaloneFieldError,
    StandaloneIntegrationCreate,
    StandaloneIntegrationPatch,
    StandaloneIntegrationRead,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.integration import (
    StandaloneIntegrationRow,
)
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)

router = APIRouter(prefix="/admin/api/v1/integrations", tags=["admin"])

logger = get_logger(__name__)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandaloneIntegrationRow) -> StandaloneIntegrationRead:
    """Translate the row into the wire model."""
    return StandaloneIntegrationRead.model_validate(
        {
            "id": row.id,
            "slug": row.slug,
            "name": row.name,
            "enabled": row.enabled,
            "integration": row.integration_config,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    )


async def _load_by_id(
    session: AsyncSession, integration_id: UUID
) -> StandaloneIntegrationRow:
    row = (
        await session.execute(
            select(StandaloneIntegrationRow).where(
                StandaloneIntegrationRow.id == str(integration_id)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=f"No integration with id {integration_id}.",
            ),
        )
    return row


@router.get("", response_model=list[StandaloneIntegrationRead])
async def list_integrations(
    session: SessionDep,
) -> list[StandaloneIntegrationRead]:
    """Return all configured integration rows ordered by created_at."""
    rows = (
        await session.execute(
            select(StandaloneIntegrationRow).order_by(
                StandaloneIntegrationRow.created_at
            )
        )
    ).scalars().all()
    return [_to_read(row) for row in rows]


@router.post(
    "",
    response_model=StandaloneMutationResponse[StandaloneIntegrationRead],
    status_code=http_status.HTTP_201_CREATED,
)
async def create_integration(
    body: StandaloneIntegrationCreate,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneIntegrationRead]:
    """Create a new integration row.

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
                    StandaloneFieldError(
                        field="name", message=str(exc), code="invalid"
                    )
                ],
            ),
        ) from exc

    try:
        slug = await ensure_unique_slug(
            session,
            StandaloneIntegrationRow,
            StandaloneIntegrationRow.slug,
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

    row = StandaloneIntegrationRow(
        slug=slug,
        name=body.name,
        enabled=body.enabled,
        integration_config=body.integration.model_dump(exclude_none=True),
    )
    session.add(row)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.integrations.create id=%s slug=%s status=%s",
        row.id,
        row.slug,
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.get("/{integration_id}", response_model=StandaloneIntegrationRead)
async def get_integration(
    integration_id: UUID, session: SessionDep
) -> StandaloneIntegrationRead:
    """Return a single integration row or 404."""
    row = await _load_by_id(session, integration_id)
    return _to_read(row)


@router.patch(
    "/{integration_id}",
    response_model=StandaloneMutationResponse[StandaloneIntegrationRead],
)
async def patch_integration(
    integration_id: UUID,
    body: StandaloneIntegrationPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneIntegrationRead]:
    """Apply a shallow update to an existing integration row.

    Only fields present in the body are touched. Slug is sticky on
    rename so existing references stay valid. Inner ``integration``
    is replaced wholesale when provided.
    """
    fields = body.model_fields_set
    row = await _load_by_id(session, integration_id)

    if not fields:
        logger.debug("admin.integrations.patch noop id=%s", row.id)
        return StandaloneMutationResponse(data=_to_read(row), reload=_NOOP_RELOAD)

    async with reload_service._reload_mutex:
        if "name" in fields and body.name is not None:
            row.name = body.name
        if "enabled" in fields and body.enabled is not None:
            row.enabled = body.enabled
        if "integration" in fields and body.integration is not None:
            row.integration_config = body.integration.model_dump(exclude_none=True)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.integrations.patch id=%s fields=%s status=%s",
        row.id,
        sorted(fields),
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "/{integration_id}",
    response_model=StandaloneMutationResponse[StandaloneDeleteResult],
)
async def delete_integration(
    integration_id: UUID,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneDeleteResult]:
    """Remove an integration row.

    Engine assembly drops the row from the active set. If the row was
    the last one, the engine continues without an integrations layer.
    """
    row = await _load_by_id(session, integration_id)
    row_id = row.id

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info(
        "admin.integrations.delete id=%s status=%s",
        row_id,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneDeleteResult(id=UUID(row_id)),
        reload=result,
    )
