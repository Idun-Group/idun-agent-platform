"""``/admin/api/v1/memory`` router.

Singleton routes for the memory configuration. Memory has no id in
the URL because there is only one row per install. Absence of the
row means the agent uses the default in-memory backend at assembly
time. ``PATCH`` upserts the row, ``DELETE`` removes it.

Both mutating handlers run under the Phase 3 reload pipeline. Round 2
(assembled config validation) catches framework/memory mismatches and
rolls the staged write back with a 422 + structured ``field_errors``.
On success, round 3 hot-reloads the engine via the injected reload
callable; framework switches and other structural changes commit the
DB and return ``restart_required`` instead of invoking reload.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
    StandaloneSingletonDeleteResult,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload

router = APIRouter(prefix="/admin/api/v1/memory", tags=["admin", "memory"])

logger = get_logger(__name__)

_SINGLETON_ID = "singleton"

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandaloneMemoryRow) -> StandaloneMemoryRead:
    """Translate the row into the wire model.

    The schema's ``memory`` field is a discriminated union, so the
    row's stored JSON dict re-validates into the right variant when
    the read model is constructed.
    """
    return StandaloneMemoryRead.model_validate(
        {
            "agent_framework": row.agent_framework,
            "memory": row.memory_config,
            "updated_at": row.updated_at,
        }
    )


async def _load_row(session: AsyncSession) -> StandaloneMemoryRow | None:
    return (
        await session.execute(select(StandaloneMemoryRow))
    ).scalar_one_or_none()


@router.get("", response_model=StandaloneMemoryRead)
async def get_memory(session: SessionDep) -> StandaloneMemoryRead:
    """Return the singleton memory row or 404 if absent."""
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=(
                    "No memory configured. Default in-memory is used at runtime."
                ),
            ),
        )
    logger.info("admin.memory.get framework=%s", row.agent_framework)
    return _to_read(row)


@router.patch("", response_model=StandaloneMutationResponse[StandaloneMemoryRead])
async def patch_memory(
    body: StandaloneMemoryPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneMemoryRead]:
    """Upsert the singleton memory row.

    First write requires both ``agentFramework`` and ``memory``.
    Updates apply only the fields explicitly present in the body.
    The reload pipeline reassembles + validates the engine config; a
    framework/memory mismatch rolls back with a 422.
    """
    fields = body.model_fields_set
    row = await _load_row(session)

    if row is None:
        creating = True
        missing: list[str] = []
        if "agent_framework" not in fields or body.agent_framework is None:
            missing.append("agentFramework")
        if "memory" not in fields or body.memory is None:
            missing.append("memory")
        if missing:
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="First write requires agentFramework and memory.",
                    field_errors=[
                        StandaloneFieldError(
                            field=name,
                            message="Required for first write.",
                            code="missing",
                        )
                        for name in missing
                    ],
                ),
            )
        row = StandaloneMemoryRow(
            id=_SINGLETON_ID,
            agent_framework=body.agent_framework.value,  # type: ignore[union-attr]
            memory_config=body.memory.model_dump(exclude_none=True),  # type: ignore[union-attr]
        )
        session.add(row)
    else:
        creating = False
        if not fields:
            logger.debug("admin.memory.patch noop")
            return StandaloneMutationResponse(
                data=_to_read(row), reload=_NOOP_RELOAD
            )
        if "agent_framework" in fields and body.agent_framework is not None:
            row.agent_framework = body.agent_framework.value
        if "memory" in fields and body.memory is not None:
            row.memory_config = body.memory.model_dump(exclude_none=True)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(
            session, reload_callable=reload_callable
        )
        await session.refresh(row)

    logger.info(
        "admin.memory.patch creating=%s framework=%s status=%s",
        creating,
        row.agent_framework,
        result.status.value,
    )

    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "",
    response_model=StandaloneMutationResponse[StandaloneSingletonDeleteResult],
)
async def delete_memory(
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneSingletonDeleteResult]:
    """Remove the singleton memory row.

    After delete, the engine assembly falls back to the default
    in-memory backend. The reload pipeline reassembles + validates
    that fallback so a misconfigured agent row surfaces as a 422
    rather than leaving the engine in a half-deleted state.
    """
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No memory configured to delete.",
            ),
        )

    framework = row.agent_framework

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(
            session, reload_callable=reload_callable
        )

    logger.info(
        "admin.memory.delete framework=%s status=%s",
        framework,
        result.status.value,
    )

    return StandaloneMutationResponse(
        data=StandaloneSingletonDeleteResult(),
        reload=result,
    )
