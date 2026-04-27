"""FastAPI app composition for the standalone runtime.

``create_standalone_app`` is an async factory that opens the DB,
assembles the engine config, builds the engine FastAPI app, layers
the admin REST surface plus the bundled UI, and wraps the engine's
lifespan so the DB engine is disposed at shutdown.

The DB engine is created during boot and kept alive on ``app.state``.
SQLAlchemy AsyncEngine is loop agnostic, so the same engine works
across the boot loop and uvicorn's loop. Callers run this via
``asyncio.run(create_standalone_app(settings))`` then hand the
returned app to ``uvicorn.run`` synchronously.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from idun_agent_engine import create_app as create_engine_app

from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.auth import router as auth_router
from idun_agent_standalone.api.v1.routers.memory import router as memory_router
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
    """Return a UI directory iff it actually contains a built SPA."""
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

    Reads the DB to assemble the engine config, builds the engine app,
    attaches admin handlers/routers, and wraps the engine lifespan so
    the DB engine is disposed at shutdown. The DB engine is kept alive
    on ``app.state`` and survives the boot loop closing.
    """
    logger.info("boot start auth_mode=%s", settings.auth_mode.value)

    db_engine = create_db_engine(settings.database_url)
    sessionmaker = create_sessionmaker(db_engine)

    async with sessionmaker() as session:
        try:
            engine_config = await assemble_engine_config(session)
        except AssemblyError as exc:
            logger.warning(
                "boot engine layer skipped, admin only mode reason=%s", exc
            )
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

    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def standalone_lifespan(app: FastAPI):
        try:
            async with original_lifespan(app):
                # Let queued tasks from engine startup run before the
                # first request. Without this /agent/run stalls.
                await asyncio.sleep(0)
                yield
        finally:
            await db_engine.dispose()

    app.router.lifespan_context = standalone_lifespan

    register_admin_exception_handlers(app)
    app.include_router(auth_router)
    app.include_router(agent_router)
    app.include_router(memory_router)
    app.include_router(runtime_config_router)

    ui_dir = _resolve_ui_dir(settings)
    if ui_dir is not None:
        app.router.routes = [
            r
            for r in app.router.routes
            if not (
                isinstance(r, APIRoute)
                and r.path == "/"
                and "GET" in r.methods
            )
        ]
        app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        logger.info("boot ui mounted from=%s", ui_dir)
    else:
        logger.info("boot ui not mounted, no built SPA found")

    logger.info("boot complete")
    return app
