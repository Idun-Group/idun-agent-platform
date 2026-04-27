"""``/admin/api/v1/memory`` router.

Singleton routes for the memory configuration. Memory has no id in
the URL because there is only one row per install. Absence of the
row means the agent uses the default in-memory backend at assembly
time. ``PATCH`` upserts the row, ``DELETE`` removes it.

``PATCH`` reassembles the engine config in the same DB session after
staging the write. A framework mismatch (for example LangGraph paired
with a SessionService memory) fails validation, the staged write is
rolled back, and the response returns 422 with structured
``field_errors``.

The reload field on the mutation envelope is a placeholder until the
reload service lands. Successful writes return ``restart_required``,
noops return ``reloaded``.
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

from idun_agent_standalone.api.v1.deps import SessionDep
from idun_agent_standalone.api.v1.errors import (
    AdminAPIError,
    field_errors_from_validation_error,
)
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow
from idun_agent_standalone.services.engine_config import (
    AgentNotConfiguredError,
    AssemblyError,
    assemble_engine_config,
)

router = APIRouter(prefix="/admin/api/v1/memory", tags=["admin", "memory"])

logger = get_logger(__name__)

_SINGLETON_ID = "singleton"

_SAVED_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RESTART_REQUIRED,
    message="Saved. Restart required to apply.",
)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)

_DELETE_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RESTART_REQUIRED,
    message="Removed. Restart required to apply.",
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
    body: StandaloneMemoryPatch, session: SessionDep
) -> StandaloneMutationResponse[StandaloneMemoryRead]:
    """Upsert the singleton memory row.

    First write requires both ``agentFramework`` and ``memory``.
    Updates apply only the fields explicitly present in the body.
    The engine config is reassembled before commit and a
    framework/memory mismatch rolls back with a 422.
    """
    fields = body.model_fields_set
    row = await _load_row(session)
    creating = row is None

    if creating:
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
        if not fields:
            logger.debug("admin.memory.patch noop")
            return StandaloneMutationResponse(
                data=_to_read(row), reload=_NOOP_RELOAD
            )
        if "agent_framework" in fields and body.agent_framework is not None:
            row.agent_framework = body.agent_framework.value
        if "memory" in fields and body.memory is not None:
            row.memory_config = body.memory.model_dump(exclude_none=True)

    await session.flush()

    try:
        await assemble_engine_config(session)
    except AgentNotConfiguredError as exc:
        await session.rollback()
        logger.info("admin.memory.patch rejected, no agent configured")
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message=(
                    "Agent must be configured before memory can be set. "
                    "Run setup with a YAML config first."
                ),
            ),
        ) from exc
    except AssemblyError as exc:
        framework = row.agent_framework
        await session.rollback()
        logger.info(
            "admin.memory.patch rejected, assembled config invalid framework=%s",
            framework,
        )
        field_errors = (
            field_errors_from_validation_error(exc.validation_error)
            if exc.validation_error is not None
            else None
        )
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message=str(exc),
                field_errors=field_errors,
            ),
        ) from exc

    await session.commit()
    await session.refresh(row)

    logger.info(
        "admin.memory.patch creating=%s framework=%s",
        creating,
        row.agent_framework,
    )

    return StandaloneMutationResponse(data=_to_read(row), reload=_SAVED_RELOAD)


@router.delete(
    "",
    response_model=StandaloneMutationResponse[StandaloneSingletonDeleteResult],
)
async def delete_memory(
    session: SessionDep,
) -> StandaloneMutationResponse[StandaloneSingletonDeleteResult]:
    """Remove the singleton memory row.

    After delete, the engine assembly falls back to the default
    in-memory backend. Reassembly is not required because the default
    backend always validates against the agent's framework.
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
    await session.delete(row)
    await session.commit()
    logger.info("admin.memory.delete done framework=%s", framework)

    return StandaloneMutationResponse(
        data=StandaloneSingletonDeleteResult(),
        reload=_DELETE_RELOAD,
    )
