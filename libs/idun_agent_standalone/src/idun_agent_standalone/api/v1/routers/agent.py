"""``/admin/api/v1/agent`` router.

Singleton routes (no id in the URL) for the standalone agent. ``GET``
returns the current row, ``PATCH`` updates metadata only. Heavy fields
like the base engine config and the lifecycle status are not patchable
through this endpoint, so the only way to change framework or agent
type is to edit the YAML and restart the process.

Mutating handlers stage the row change, then run the 3-round reload
pipeline (``commit_with_reload``) under ``_reload_mutex`` so two
concurrent admin PATCHes serialize. The ``reload`` field on the
mutation response carries the real outcome from round 3 (or the
structural-change short-circuit, or the empty-body fast path).
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneAgentPatch,
    StandaloneAgentRead,
    StandaloneErrorCode,
    StandaloneFieldError,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import (
    AdminAPIError,
    field_errors_from_validation_error,
)
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.engine_config import (
    AssemblyError,
    assemble_engine_config,
)
from idun_agent_standalone.services.reload import commit_with_reload
from idun_agent_standalone.services.validation import (
    RoundTwoValidationFailed,
    validate_assembled_config,
)

router = APIRouter(prefix="/admin/api/v1/agent", tags=["admin"])

logger = get_logger(__name__)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
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
    body: StandaloneAgentPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
    dry_run: bool = Query(default=False, alias="dryRun"),
) -> StandaloneMutationResponse[StandaloneAgentRead]:
    """Update metadata fields on the singleton agent.

    Empty body short-circuits with no DB write and no reload. Any
    non-empty mutation flows through the 3-round reload pipeline.

    With ``?dryRun=true``, runs rounds 1 + 2 + 2.5 (Pydantic body,
    assembled config, graph_definition probe) but skips the DB commit
    and engine reload. Returns ``reload.status="not_attempted"`` and
    rolls back any staged DB changes.
    """
    fields = body.model_fields_set
    row = await _load_agent(session)

    if not fields:
        logger.debug("admin.agent.patch noop id=%s", row.id)
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=_NOOP_RELOAD,
        )

    if dry_run:
        # Stage the mutation in-session so the assembled config reflects
        # what *would* be saved, then run rounds 2 + 2.5 manually without
        # commit_with_reload (which always commits + reloads). Roll back
        # at the end so the DB is untouched.
        for field in fields:
            setattr(row, field, getattr(body, field))
        await session.flush()

        try:
            assembled = await assemble_engine_config(session)
        except AssemblyError as exc:
            await session.rollback()
            field_errors = (
                field_errors_from_validation_error(exc.validation_error)
                if exc.validation_error is not None
                else []
            )
            logger.info(
                "admin.agent.patch dry_run round2_failed field_count=%s",
                len(field_errors),
            )
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="Assembled config failed validation.",
                    field_errors=field_errors,
                ),
            ) from exc

        try:
            validate_assembled_config(assembled)
        except RoundTwoValidationFailed as exc:
            await session.rollback()
            logger.info(
                "admin.agent.patch dry_run round2_failed field_count=%s",
                len(exc.field_errors),
            )
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="Assembled config failed validation.",
                    field_errors=exc.field_errors,
                ),
            ) from exc

        # Round 2.5 — file-reference probe for the agent's graph_definition.
        if assembled.agent.type.value == "LANGGRAPH":
            graph_def = getattr(assembled.agent.config, "graph_definition", None)
            if graph_def:
                from pathlib import Path

                from idun_agent_engine.agent.validation import (
                    validate_graph_definition,
                )

                probe = validate_graph_definition(
                    framework="langgraph",
                    definition=graph_def,
                    project_root=Path.cwd(),
                )
                if not probe.ok:
                    await session.rollback()
                    logger.info(
                        "admin.agent.patch dry_run round2_5_failed code=%s",
                        probe.code.value if probe.code else "unknown",
                    )
                    raise AdminAPIError(
                        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                        error=StandaloneAdminError(
                            code=StandaloneErrorCode.VALIDATION_FAILED,
                            message="Graph definition could not be loaded.",
                            field_errors=[
                                StandaloneFieldError(
                                    field="agent.config.graphDefinition",
                                    message=probe.message
                                    + (f" {probe.hint}" if probe.hint else ""),
                                    code=probe.code.value if probe.code else "invalid",
                                ),
                            ],
                        ),
                    )

        # Validation passed — discard the staged mutation, refresh, return
        # the unchanged row with reload.status=not_attempted.
        await session.rollback()
        await session.refresh(row)
        logger.info(
            "admin.agent.patch dry_run id=%s fields=%s status=not_attempted",
            row.id,
            sorted(fields),
        )
        return StandaloneMutationResponse(
            data=StandaloneAgentRead.model_validate(row),
            reload=StandaloneReloadResult(
                status=StandaloneReloadStatus.NOT_ATTEMPTED,
                message="Dry run — no changes committed.",
            ),
        )

    async with reload_service._reload_mutex:
        for field in fields:
            setattr(row, field, getattr(body, field))
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.agent.patch id=%s name=%s fields=%s status=%s",
        row.id,
        row.name,
        sorted(fields),
        result.status.value,
    )

    return StandaloneMutationResponse(
        data=StandaloneAgentRead.model_validate(row),
        reload=result,
    )
