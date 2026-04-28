"""The 3-round reload pipeline.

Single in-process ``asyncio.Lock`` around ``commit_with_reload``. The
caller acquires the lock, stages a DB mutation, calls ``flush``, then
invokes ``commit_with_reload``. The pipeline:

  1. Assembles ``EngineConfig`` from the staged session state.
  2. Round 2: validates the assembled config (``services.validation``).
  3. Detects structural change vs prior runtime_state.
  4. If structural: commits DB, records outcome, returns
     ``restart_required``. The reload callable is NOT invoked.
  5. Else: round 3 invokes ``reload_callable``.
       - On success: commits DB, records outcome, returns ``reloaded``.
       - On ``ReloadInitFailed``: rolls back DB, records the failure
         outcome (in a fresh session-level write), commits the outcome,
         raises ``AdminAPIError(500, code=reload_failed)``.

Round 1 (Pydantic body validation) is FastAPI's responsibility and
happens before the handler runs.

The reload callable is dependency-injected so tests stub a fake
without booting a real engine.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from hashlib import sha256

import rfc8785
from fastapi import status as http_status
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.errors import (
    AdminAPIError,
    field_errors_from_validation_error,
)
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.runtime_state import (
    StandaloneRuntimeStateRow,
)
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.engine_config import (
    AssemblyError,
    assemble_engine_config,
)
from idun_agent_standalone.services.validation import (
    RoundTwoValidationFailed,
    validate_assembled_config,
)

logger = get_logger(__name__)


_reload_mutex = asyncio.Lock()


class ReloadInitFailed(Exception):  # noqa: N818
    """Raised when round 3 (engine reload via reload_callable) fails.

    Named for the action that fails (engine reload init), not as
    a generic ``-Error``, so the call site reads as a flow-control
    signal rather than a typed error class.
    """


def _default_now() -> datetime:
    return datetime.now(UTC)


def _structural_slice(engine_config: EngineConfig) -> dict[str, object]:
    """Return the structural fields that require process restart on change.

    Per spec §"Save/reload posture":
      - ``agent.framework``
      - ``agent.config.graph_definition`` (LangGraph entry point)

    Other fields (agent name, description, version, base_url, integrations,
    MCP servers, observability, prompts) are hot-reloadable and do NOT
    require restart.

    Note: only LangGraph structural fields are tracked here. ADK and
    other frameworks have no analog of ``graph_definition`` in this
    slice, so an ADK-side structural change (e.g. swapping the agent
    type or changing memory backend in a way the engine cannot
    hot-reload) is currently undetected. Extending the slice for
    other frameworks is deferred to a later phase when the engine's
    own reload semantics are clearer.
    """
    return {
        "framework": engine_config.agent.type.value,
        "graph_definition": getattr(
            engine_config.agent.config, "graph_definition", None
        ),
    }


def _structural_hash(engine_config: EngineConfig) -> str:
    """Hash only the structural slice. 64-char hex sha256 over JCS bytes."""
    # rfc8785's _Value type alias is internal; the structural slice is a
    # plain JSON-serializable dict, so the runtime contract is satisfied.
    canonical = rfc8785.dumps(_structural_slice(engine_config))  # type: ignore[arg-type]
    return sha256(canonical).hexdigest()


def _is_structural_change(
    assembled: EngineConfig,
    prior_state: StandaloneRuntimeStateRow | None,
) -> bool:
    """True iff structural fields changed since the last applied config.

    On first boot (``prior_state`` is None or ``last_applied_config_hash``
    is None), returns False — the first config is never structural.

    Phase 3 storage choice: ``last_applied_config_hash`` carries the
    structural-slice hash (not the full config hash) so this comparison
    is a single column read. The full config hash for /runtime/status
    will be computed on-demand in Phase 6.
    """
    if prior_state is None or prior_state.last_applied_config_hash is None:
        return False
    return prior_state.last_applied_config_hash != _structural_hash(assembled)


async def commit_with_reload(
    session: AsyncSession,
    *,
    reload_callable: Callable[[EngineConfig], Awaitable[None]],
    now: Callable[[], datetime] = _default_now,
) -> StandaloneReloadResult:
    """Run the 3-round pipeline.

    Caller must:
      - acquire ``_reload_mutex`` via ``async with _reload_mutex:``
      - stage DB mutation (e.g. add/modify ORM rows)
      - call ``session.flush()``

    On round 2 failure: rollback, raise 422 ``AdminAPIError``.
    On structural change: commit DB, record outcome, return
        ``restart_required``.
    On round 3 failure: rollback user mutation, record failure outcome,
        commit, raise 500 ``AdminAPIError``.
    On full success: commit DB, record outcome, return ``reloaded``.
    """
    try:
        assembled = await assemble_engine_config(session)
    except AssemblyError as exc:
        # Assembly performs Pydantic validation on the base + assembled
        # config. If it fails here, that is a round-2 failure: the
        # caller's mutation produced a config that cannot be safely
        # validated against the schema. Roll back and surface the
        # underlying field errors when available.
        await session.rollback()
        field_errors = (
            field_errors_from_validation_error(exc.validation_error)
            if exc.validation_error is not None
            else []
        )
        logger.info(
            "reload.round2_failed field_count=%s", len(field_errors)
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
            "reload.round2_failed field_count=%s", len(exc.field_errors)
        )
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Assembled config failed validation.",
                field_errors=exc.field_errors,
            ),
        ) from exc

    structural_hash = _structural_hash(assembled)
    prior = await runtime_state.get(session)
    structural = _is_structural_change(assembled, prior)

    if structural:
        await session.commit()
        await runtime_state.record_reload_outcome(
            session,
            status=StandaloneReloadStatus.RESTART_REQUIRED,
            message="Saved. Restart required to apply.",
            error=None,
            config_hash=structural_hash,
            reloaded_at=now(),
        )
        await session.commit()
        logger.info("reload.restart_required hash=%s", structural_hash[:8])
        return StandaloneReloadResult(
            status=StandaloneReloadStatus.RESTART_REQUIRED,
            message="Saved. Restart required to apply.",
        )

    try:
        await reload_callable(assembled)
    except ReloadInitFailed as exc:
        await session.rollback()
        await runtime_state.record_reload_outcome(
            session,
            status=StandaloneReloadStatus.RELOAD_FAILED,
            message="Engine reload failed; config not saved.",
            error=str(exc),
            config_hash=None,
            reloaded_at=now(),
        )
        await session.commit()
        logger.warning("reload.round3_failed error=%s", str(exc)[:120])
        raise AdminAPIError(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.RELOAD_FAILED,
                message="Engine reload failed; config not saved.",
                details={"recovered": True},
            ),
        ) from exc

    await session.commit()
    await runtime_state.record_reload_outcome(
        session,
        status=StandaloneReloadStatus.RELOADED,
        message="Saved and reloaded.",
        error=None,
        config_hash=structural_hash,
        reloaded_at=now(),
    )
    await session.commit()
    logger.info("reload.reloaded hash=%s", structural_hash[:8])
    return StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved and reloaded.",
    )
