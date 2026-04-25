"""App-level engine reload orchestrator with previous-config recovery.

When an admin mutates a resource, the standalone assembles a fresh
``EngineConfig`` and calls ``orchestrate_reload``. Structural changes
(framework, graph_definition path) are persisted but require a process
restart to take effect; everything else hot-swaps the live agent. If
init fails, we attempt to re-init the previous config so the agent stays
available.

The engine exposes its lifecycle hooks at the FastAPI app level
(``cleanup_agent(app)`` / ``configure_app(app, cfg)``) — there is no
``shutdown_agent``/``initialize`` method on ``BaseAgent`` itself. This
module accepts those hooks via dependency injection so unit tests can
substitute fakes without touching the engine.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


CleanupFn = Callable[[Any], Awaitable[None]]
ConfigureFn = Callable[[Any, Any], Awaitable[None]]


@dataclass
class ReloadOutcome:
    kind: str  # "reloaded" | "restart_required" | "init_failed"
    message: str = ""
    recovered: bool | None = None


async def orchestrate_reload(
    *,
    app: Any,
    new_config: Any,
    previous_config: Any,
    structural_change: bool,
    cleanup: CleanupFn,
    configure: ConfigureFn,
) -> ReloadOutcome:
    """Hot-swap the agent on ``app`` from ``previous_config`` to ``new_config``.

    On init failure, attempt to re-apply ``previous_config`` so the agent
    remains live. Returns a :class:`ReloadOutcome` describing the outcome.
    """
    if structural_change:
        return ReloadOutcome(kind="restart_required")

    try:
        await cleanup(app)
    except Exception:  # noqa: BLE001 — log and continue regardless of teardown error
        logger.exception("cleanup_agent failed — continuing to configure anyway")

    try:
        await configure(app, new_config)
        return ReloadOutcome(kind="reloaded")
    except Exception as e:  # noqa: BLE001 — broad catch is intentional
        logger.exception("engine init failed; attempting recovery")
        try:
            # Best-effort cleanup of any partial state from the failed init
            try:
                await cleanup(app)
            except Exception:  # noqa: BLE001
                logger.exception("cleanup before recovery failed — continuing")
            await configure(app, previous_config)
            return ReloadOutcome(
                kind="init_failed", message=str(e), recovered=True
            )
        except Exception as e2:  # noqa: BLE001
            logger.exception("recovery init also failed")
            return ReloadOutcome(
                kind="init_failed",
                message=f"{e}; recovery: {e2}",
                recovered=False,
            )
