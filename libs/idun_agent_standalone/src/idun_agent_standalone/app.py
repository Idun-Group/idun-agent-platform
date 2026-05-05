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

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute, Mount
from fastapi.staticfiles import StaticFiles
from idun_agent_engine import create_app as create_engine_app

from idun_agent_standalone.api.v1.deps import reload_disabled, require_auth
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.auth import router as auth_router
from idun_agent_standalone.api.v1.routers.guardrails import (
    router as guardrails_router,
)
from idun_agent_standalone.api.v1.routers.integrations import (
    router as integrations_router,
)
from idun_agent_standalone.api.v1.routers.mcp_servers import (
    router as mcp_servers_router,
)
from idun_agent_standalone.api.v1.routers.memory import router as memory_router
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.api.v1.routers.onboarding import (
    router as onboarding_router,
)
from idun_agent_standalone.api.v1.routers.prompts import (
    router as prompts_router,
)
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.security import SESSION_COOKIE_NAME
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.session import (
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.runtime_config import router as runtime_config_router
from idun_agent_standalone.services import auth as auth_service
from idun_agent_standalone.services.engine_config import (
    AssemblyError,
    assemble_engine_config,
)

logger = get_logger(__name__)


_PUBLIC_PATHS = frozenset({
    "/",
    "/health",
    "/runtime-config.js",
    "/agent/run",
    "/agent/stream",
    "/agent/copilotkit/stream",
    "/agent/invoke",
    "/agent/capabilities",
})


def _is_public_runtime_path(path: str) -> bool:
    if path in _PUBLIC_PATHS:
        return True
    # /admin/api/v1/auth/ has to win before the broader /admin/api/ deny
    # below, otherwise login itself becomes unreachable.
    if path.startswith("/admin/api/v1/auth/"):
        return True
    if path.startswith("/admin/api/"):
        return False
    if (
        path.startswith("/admin")
        or path.startswith("/login")
        or path.startswith("/_next/")
    ):
        return True
    if path.startswith("/agent/") or path.startswith("/_engine/"):
        return False
    return path != "/reload"


def _install_engine_runtime_gate(app: FastAPI) -> None:
    # TODO(#544): drop once the engine ships first-class password auth.
    @app.middleware("http")
    async def gate_engine_runtime(request: Request, call_next):
        settings: StandaloneSettings = request.app.state.settings
        if settings.auth_mode != AuthMode.PASSWORD:
            return await call_next(request)
        if _is_public_runtime_path(request.url.path):
            return await call_next(request)
        cookie = request.cookies.get(SESSION_COOKIE_NAME)
        sessionmaker = request.app.state.sessionmaker
        async with sessionmaker() as session:
            ok = await auth_service.validate_session(
                session, signed_cookie=cookie, settings=settings
            )
        if not ok:
            return JSONResponse(
                {"detail": "Authentication required."}, status_code=401
            )
        return await call_next(request)


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

    if settings.auth_mode == AuthMode.PASSWORD:
        from idun_agent_standalone.services.auth import ensure_admin_seeded

        async with sessionmaker() as session:
            await ensure_admin_seeded(session, settings)

    async with sessionmaker() as session:
        try:
            engine_config = await assemble_engine_config(session)
        except AssemblyError as exc:
            logger.warning("boot engine layer skipped, admin only mode reason=%s", exc)
            engine_config = None

    # Always boot through the engine factory. When ``engine_config`` is
    # ``None`` (no agent in DB yet — first-run wizard hasn't materialized),
    # the engine boots in unconfigured mode: routes are registered but
    # ``/agent/*`` returns 503 ``agent_not_ready``. The wizard's
    # materialize step calls the reload pipeline which runs
    # ``configure_app`` and brings the same routes online — no process
    # restart required.
    app = create_engine_app(
        engine_config=engine_config,
        reload_auth=reload_disabled,
    )
    if engine_config is not None:
        logger.info(
            "boot engine app built framework=%s",
            engine_config.agent.type.value,
        )
    else:
        logger.info(
            "boot engine app started unconfigured "
            "(no agent yet — wizard will materialize)"
        )

    app.state.settings = settings
    app.state.db_engine = db_engine
    app.state.sessionmaker = sessionmaker
    from idun_agent_standalone.services.engine_reload import (
        build_engine_reload_callable,
    )

    app.state.reload_callable = build_engine_reload_callable(app)

    _install_engine_runtime_gate(app)
    register_admin_exception_handlers(app)
    admin_auth = [Depends(require_auth)]
    app.include_router(auth_router)
    app.include_router(agent_router, dependencies=admin_auth)
    app.include_router(memory_router, dependencies=admin_auth)
    app.include_router(observability_router, dependencies=admin_auth)
    app.include_router(mcp_servers_router, dependencies=admin_auth)
    app.include_router(guardrails_router, dependencies=admin_auth)
    app.include_router(prompts_router, dependencies=admin_auth)
    app.include_router(integrations_router, dependencies=admin_auth)
    app.include_router(onboarding_router, dependencies=admin_auth)
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

        if not hasattr(app.state, "post_configure_callbacks"):
            app.state.post_configure_callbacks = []
        app.state.post_configure_callbacks.append(_keep_ui_mount_last)
    else:
        logger.info("boot ui not mounted, no built SPA found")

    logger.info("boot complete")
    return app


async def _keep_ui_mount_last(app: FastAPI) -> None:
    """Re-pin the SPA mount last so engine reload routes stay reachable."""
    routes = app.router.routes
    ui_mount = next(
        (r for r in routes if isinstance(r, Mount) and r.name == "ui"),
        None,
    )
    if ui_mount is None:
        return
    routes.remove(ui_mount)
    routes.append(ui_mount)
    logger.info("post_configure ui mount re-pinned last route_count=%d", len(routes))
