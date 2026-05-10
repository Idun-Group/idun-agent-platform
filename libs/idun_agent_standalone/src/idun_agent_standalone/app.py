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

The engine's lifespan is wrapped so a cooperative scheduling fence runs
between startup completion and the first request — without it, langgraph
checkpointer bootstrap and other deferred callbacks have been observed
to leave the first ``/agent/run`` SSE stream stalled. The wrapper also
disposes the SQLAlchemy AsyncEngine on shutdown.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute, Mount
from fastapi.staticfiles import StaticFiles
from idun_agent_engine import create_app as create_engine_app

from idun_agent_standalone.api.v1._register import register_standalone_routers
from idun_agent_standalone.api.v1.deps import reload_disabled, require_auth
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.openapi import OPENAPI_TAGS
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.security import SESSION_COOKIE_NAME
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.session import (
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.infrastructure.traces.bootstrap import (
    attach_trace_pipeline,
)
from idun_agent_standalone.services import auth as auth_service
from idun_agent_standalone.services.engine_config import (
    AssemblyError,
    assemble_engine_config,
)

logger = get_logger(__name__)


_PUBLIC_PATHS = frozenset(
    {
        "/",
        "/health",
        "/runtime-config.js",
        "/sso/info",
        "/agent/run",
        "/agent/stream",
        "/agent/copilotkit/stream",
        "/agent/invoke",
        "/agent/capabilities",
    }
)


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
            return JSONResponse({"detail": "Authentication required."}, status_code=401)
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
    logger.info("boot start auth_mode=%s", settings.auth_mode.value)

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

    # Wrap the engine's lifespan so any callbacks scheduled during startup
    # (langgraph checkpointer schema bootstrap, asyncpg / aiosqlite pool
    # warmups) get one cooperative tick to run before the first request
    # arrives. Without the ``asyncio.sleep(0)`` fence, ``/agent/run`` SSE
    # streams have been observed to stall on first message because the
    # checkpointer is still mid-init when the handler tries to read state.
    # Also disposes the SQLAlchemy AsyncEngine on shutdown so the pool
    # closes cleanly.
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def standalone_lifespan(app: FastAPI):
        try:
            async with original_lifespan(app):
                await asyncio.sleep(0)
                yield
        finally:
            # Stop the trace pipeline tasks before disposing the engine,
            # otherwise the writer's next ``_drain_once`` (which opens a
            # session against the disposed pool) and the retention
            # scheduler's daily job race against a closed AsyncEngine
            # and surface as noise in the shutdown logs.
            #
            # ``getattr`` with a default keeps shutdown idempotent: if
            # the bootstrap callback never fired (admin-only mode, no
            # post_configure pass), the attrs simply don't exist.
            writer = getattr(app.state, "trace_writer_task", None)
            if writer is not None:
                try:
                    await writer.stop()
                except Exception:
                    logger.exception("shutdown trace writer stop failed")
                app.state.trace_writer_task = None
            retention = getattr(app.state, "trace_retention_task", None)
            if retention is not None:
                try:
                    await retention.stop()
                except Exception:
                    logger.exception("shutdown trace retention stop failed")
                app.state.trace_retention_task = None
            await db_engine.dispose()

    app.router.lifespan_context = standalone_lifespan

    _install_engine_runtime_gate(app)
    register_admin_exception_handlers(app)
    app.openapi_tags = OPENAPI_TAGS
    admin_auth = [Depends(require_auth)]
    register_standalone_routers(app, admin_auth=admin_auth)

    ui_dir = _resolve_ui_dir(settings)
    if ui_dir is not None:
        # Drop only the engine's GET / so the static SPA can take over the
        # bare path, but leave any POST / route intact (e.g. agent runs that
        # may legitimately bind there).
        app.router.routes = [
            r
            for r in app.router.routes
            if not (isinstance(r, APIRoute) and r.path == "/" and "GET" in r.methods)
        ]

        # SPA rewrite for the trace-detail dynamic route. Next.js static
        # export emits the placeholder shell at admin/traces/_shell/;
        # arbitrary trace ids in the URL path won't resolve against
        # StaticFiles because each id is a different filesystem path.
        # Serve the placeholder for any /admin/traces/<id> request and
        # let the client read the real id from window.location.
        #
        # Both URL forms (``/admin/traces/<id>`` and
        # ``/admin/traces/<id>/``) need explicit route declarations.
        # FastAPI's ``redirect_slashes=True`` only redirects ``/foo/``
        # back to ``/foo`` for routes declared without the trailing
        # slash, *not* the inverse — and once ``StaticFiles(html=True)``
        # is mounted at ``/``, the slashed form is consumed by the
        # static handler before the dynamic route sees it, yielding
        # ``404`` on every link-share / Slack-unfurl form. Declaring
        # the slashed sibling route fixes that.
        from fastapi import HTTPException
        from fastapi.responses import FileResponse

        # Resolve the SPA shell path once at boot — the file layout cannot
        # change at runtime and the request handler is on the async hot
        # path, so the per-request ``Path.is_file()`` syscall is wasteful
        # (ASYNC-001). Prefers the renamed ``_shell/`` directory shipped
        # by the ``build-standalone-ui`` Make target; falls back to the
        # legacy ``__trace__/`` directory when the static export was
        # produced by ``pnpm build`` directly (no rename pass), and to
        # the root ``index.html`` when neither directory exists. The
        # legacy ``__trace__`` fallback exists so the boot harness
        # (``e2e/boot-standalone.sh``) and direct ``pnpm build``
        # workflows keep working until they run through the rename.
        _trace_shell_renamed = ui_dir / "admin" / "traces" / "_shell" / "index.html"
        _trace_shell_legacy = ui_dir / "admin" / "traces" / "__trace__" / "index.html"
        _spa_root_shell = ui_dir / "index.html"
        if _trace_shell_renamed.is_file():
            _selected_trace_shell = _trace_shell_renamed
        elif _trace_shell_legacy.is_file():
            _selected_trace_shell = _trace_shell_legacy
        else:
            _selected_trace_shell = _spa_root_shell

        # The legacy ``__trace__`` segment is the build-time placeholder
        # path that ships into the static export when ``pnpm build`` runs
        # without the rename pass. Even after the rename pass it remains
        # reachable via the dynamic SPA-rewrite below if a stale link
        # leaks into the wild — surface a 410 Gone so operators clicking
        # an old bookmark see a clear "this isn't a real trace id"
        # signal instead of the SPA's softer client-side 404.
        _placeholder_trace_id = "__trace__"

        @app.get("/admin/traces/{trace_id}", include_in_schema=False)
        async def _trace_detail_spa_shell(trace_id: str) -> FileResponse:
            if trace_id == _placeholder_trace_id:
                raise HTTPException(
                    status_code=410, detail="trace placeholder is not a real id"
                )
            return FileResponse(_selected_trace_shell)

        @app.get("/admin/traces/{trace_id}/", include_in_schema=False)
        async def _trace_detail_spa_shell_slashed(
            trace_id: str,
        ) -> FileResponse:
            if trace_id == _placeholder_trace_id:
                raise HTTPException(
                    status_code=410, detail="trace placeholder is not a real id"
                )
            return FileResponse(_selected_trace_shell)

        app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        logger.info("boot ui mounted from=%s", ui_dir)

        if not hasattr(app.state, "post_configure_callbacks"):
            app.state.post_configure_callbacks = []
        app.state.post_configure_callbacks.append(_keep_ui_mount_last)
    else:
        logger.info("boot ui not mounted, no built SPA found")

    # Wire the trace pipeline into the engine's OTel pipeline. This
    # callback fires on every configure_app — boot AND reload — and
    # is responsible for attaching the SpanExporter, spawning the
    # writer + retention tasks, and self-installing the LangChain
    # instrumentor when the user picked a non-OTel provider.
    if not hasattr(app.state, "post_configure_callbacks"):
        app.state.post_configure_callbacks = []
    app.state.post_configure_callbacks.append(attach_trace_pipeline)

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
