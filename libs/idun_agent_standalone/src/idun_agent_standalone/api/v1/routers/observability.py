"""``/admin/api/v1/observability`` router.

Singleton routes for the observability provider. Observability has no
id in the URL because there is only one provider per install. Absence
of the row means no observability provider is configured (engine
runs without telemetry).

Both mutating handlers run under the Phase 3 reload pipeline. Round 2
re-validates the assembled engine config; on success round 3 hot
reloads the engine via the injected reload callable. Structural
changes commit the DB and return ``restart_required``.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneMutationResponse,
    StandaloneObservabilityPatch,
    StandaloneObservabilityRead,
    StandaloneReloadResult,
    StandaloneReloadStatus,
    StandaloneSingletonDeleteResult,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.observability import (
    StandaloneObservabilityRow,
)
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload

router = APIRouter(prefix="/admin/api/v1/observability", tags=["admin"])

logger = get_logger(__name__)

_SINGLETON_ID = "singleton"

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandaloneObservabilityRow) -> StandaloneObservabilityRead:
    """Translate the row into the wire model.

    The schema's ``observability`` field is a Pydantic model, so the
    row's stored JSON dict re-validates when the read model is built.
    """
    return StandaloneObservabilityRead.model_validate(
        {
            "observability": row.observability_config,
            "updated_at": row.updated_at,
        }
    )


async def _load_row(session: AsyncSession) -> StandaloneObservabilityRow | None:
    return (
        await session.execute(select(StandaloneObservabilityRow))
    ).scalar_one_or_none()


@router.get("", response_model=StandaloneObservabilityRead)
async def get_observability(session: SessionDep) -> StandaloneObservabilityRead:
    """Return the singleton observability row or 404 if absent."""
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No observability provider configured.",
            ),
        )
    return _to_read(row)


@router.patch(
    "",
    response_model=StandaloneMutationResponse[StandaloneObservabilityRead],
)
async def patch_observability(
    body: StandaloneObservabilityPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneObservabilityRead]:
    """Upsert the singleton observability row.

    First write requires ``observability``. Updates apply only the
    fields explicitly present in the body. The reload pipeline
    reassembles + validates the engine config; failures roll back
    with a 422.
    """
    fields = body.model_fields_set
    row = await _load_row(session)

    if row is None:
        if "observability" not in fields or body.observability is None:
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="First write requires observability.",
                ),
            )
        row = StandaloneObservabilityRow(
            id=_SINGLETON_ID,
            observability_config=body.observability.model_dump(exclude_none=True),
        )
        session.add(row)
    else:
        if not fields:
            logger.debug("admin.observability.patch noop")
            return StandaloneMutationResponse(
                data=_to_read(row), reload=_NOOP_RELOAD
            )
        if "observability" in fields and body.observability is not None:
            row.observability_config = body.observability.model_dump(exclude_none=True)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info("admin.observability.patch status=%s", result.status.value)
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "",
    response_model=StandaloneMutationResponse[StandaloneSingletonDeleteResult],
)
async def delete_observability(
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneSingletonDeleteResult]:
    """Remove the singleton observability row.

    After delete, the engine assembly drops the observability list. The
    reload pipeline reassembles + validates so a misconfigured agent
    surfaces as a 422 rather than leaving the engine in a half deleted
    state.
    """
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No observability provider configured to delete.",
            ),
        )

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info("admin.observability.delete status=%s", result.status.value)
    return StandaloneMutationResponse(
        data=StandaloneSingletonDeleteResult(),
        reload=result,
    )
