"""Engine reload orchestrator with previous-config recovery.

When an admin mutates a resource, the standalone assembles a fresh
``EngineConfig`` and calls ``orchestrate_reload``. Structural changes
(framework, graph_definition path) are persisted but require a process
restart to take effect; everything else hot-swaps the live agent. If
init fails, we attempt to re-init the previous config so the agent stays
available.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class EngineLike(Protocol):
    async def shutdown_agent(self) -> None: ...

    async def initialize(self, cfg: Any) -> None: ...


@dataclass
class ReloadOutcome:
    kind: str  # "reloaded" | "restart_required" | "init_failed"
    message: str = ""
    recovered: bool | None = None


async def orchestrate_reload(
    *,
    engine: EngineLike,
    new_config: Any,
    previous_config: Any,
    structural_change: bool,
) -> ReloadOutcome:
    if structural_change:
        return ReloadOutcome(kind="restart_required")

    try:
        await engine.shutdown_agent()
    except Exception:  # noqa: BLE001 — log and continue regardless of shutdown error
        logger.exception("shutdown_agent failed — continuing to initialize anyway")

    try:
        await engine.initialize(new_config)
        return ReloadOutcome(kind="reloaded")
    except Exception as e:  # noqa: BLE001 — broad catch is intentional
        logger.exception("engine init failed; attempting recovery")
        try:
            await engine.initialize(previous_config)
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
