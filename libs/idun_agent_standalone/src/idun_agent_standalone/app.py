"""FastAPI app composition for the standalone runtime.

One async factory, ``create_standalone_app``, builds the engine FastAPI
app and layers the admin REST surface plus the bundled UI onto the
same instance. The DB read needed to assemble the engine config runs
in the same event loop that uvicorn will use to serve requests, so
async resources (the SQLAlchemy engine, the LLM SDK's httpx pool) all
live in one loop.

When assembly fails (no agent row, corrupted base config) the engine
layer is skipped and only the admin surface comes up so the operator
can still inspect and fix the install through the admin API.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from idun_agent_engine import create_app as create_engine_app

from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.auth import router as auth_router
from idun_agent_standalone.api.v1.routers.memory import router as memory_router
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.settings import StandaloneSettings
from idun_agent_standalone.infrastructure.db.session import (
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.runtime_config import router as runtime_config_router
from idun_agent_standalone.services.engine_config import (
    AssemblyError,
    assemble_engine_config,
)

logger = get_logger(__name__)


def _resolve_ui_dir(settings: StandaloneSettings) -> Path | None:
    """Return a UI directory iff it actually contains a built SPA.

    Honors ``IDUN_UI_DIR`` first, then falls back to the bundled
    ``static/`` directory shipped with the wheel. Presence of
    ``index.html`` is the signal so an empty ``static/`` placeholder
    does not register a catch all.
    """
    if settings.ui_dir is not None:
        candidate = Path(settings.ui_dir)
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return candidate
    bundled = Path(__file__).parent / "static"
    if bundled.is_dir() and (bundled / "index.html").is_file():
        return bundled
    return None


async def create_standalone_app(settings: StandaloneSettings) -> FastAPI:
    """Build the standalone FastAPI app.

    Reads the standalone DB to assemble the engine config, builds the
    engine app on top of that config, then attaches admin handlers,
    admin routers, the runtime config bootstrap, and the bundled UI.
    The DB engine and sessionmaker stay on ``app.state`` for admin
    routers to use across the rest of the process lifetime.
    """
    logger.info(
        "boot start db_url=%s auth_mode=%s",
        settings.database_url,
        settings.auth_mode.value,
    )

    db_engine = create_db_engine(settings.database_url)
    sessionmaker = create_sessionmaker(db_engine)

    async with sessionmaker() as session:
        try:
            engine_config = await assemble_engine_config(session)
        except AssemblyError as exc:
            logger.warning("boot engine layer skipped, admin only mode reason=%s", exc)
            engine_config = None

    if engine_config is not None:
        app = create_engine_app(engine_config=engine_config)
        logger.info(
            "boot engine app built framework=%s",
            engine_config.agent.type.value,
        )
    else:
        app = FastAPI(title="Idun Agent Standalone (admin only)")

    app.state.settings = settings
    app.state.db_engine = db_engine
    app.state.sessionmaker = sessionmaker
    from idun_agent_standalone.services.engine_reload import (
        build_engine_reload_callable,
    )

    app.state.reload_callable = build_engine_reload_callable(app)

    register_admin_exception_handlers(app)
    app.include_router(auth_router)
    app.include_router(agent_router)
    app.include_router(memory_router)
    app.include_router(observability_router)
    app.include_router(runtime_config_router)

    ui_dir = _resolve_ui_dir(settings)
    if ui_dir is not None:
        app.router.routes = [
            r
            for r in app.router.routes
            if not (isinstance(r, APIRoute) and r.path == "/")
        ]
        app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        logger.info("boot ui mounted from=%s", ui_dir)
    else:
        logger.info("boot ui not mounted, no built SPA found")

    logger.info("boot complete")
    return app
