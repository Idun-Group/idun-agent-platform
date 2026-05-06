"""Build the engine reload callable for the standalone runtime.

The engine exposes two app level lifecycle hooks at
``idun_agent_engine.server.lifespan``: ``cleanup_agent(app)`` and
``configure_app(app, engine_config)``. We rebuild the agent in place
by tearing down the old one and re running the configure step on the
same FastAPI app instance, which is exactly what the engine itself
does on its own ``POST /reload`` route. The standalone reload
pipeline owns rollback and runtime_state recording, so the callable
just translates engine exceptions to ``ReloadInitFailed``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import FastAPI
from idun_agent_engine.server.lifespan import cleanup_agent, configure_app
from idun_agent_schema.engine.engine import EngineConfig

from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.services.reload import ReloadInitFailed

logger = get_logger(__name__)


def build_engine_reload_callable(
    engine_app: FastAPI,
) -> Callable[[EngineConfig], Awaitable[None]]:
    """Return a callable that rebuilds the engine on the given app.

    The callable cleans up the current agent (if any) and runs
    ``configure_app`` with the supplied config. Any failure is wrapped
    in ``ReloadInitFailed`` so the standalone reload pipeline can
    record the outcome and surface a 500 to the admin caller.
    """

    async def _reload(config: EngineConfig) -> None:
        try:
            try:
                await cleanup_agent(engine_app)
            except Exception:
                logger.exception("engine_reload.cleanup_failed continuing to configure")
            await configure_app(engine_app, config)
        except Exception as exc:
            logger.exception("engine_reload.configure_failed")
            raise ReloadInitFailed(str(exc), original=exc) from exc

    return _reload
