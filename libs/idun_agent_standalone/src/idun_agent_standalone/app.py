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
from idun_agent_engine.prompts.registry import set_active_prompts
from sqlalchemy import func, select

from idun_agent_standalone.api.v1._register import register_standalone_routers
from idun_agent_standalone.api.v1.deps import reload_disabled, require_auth
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.openapi import OPENAPI_TAGS
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.core.security import SESSION_COOKIE_NAME
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
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

    # Count agent rows first so AssemblyError can be classified.
    # Zero rows + AssemblyError is wizard mode (intentional fall-through to
    # admin-only). Any rows + AssemblyError is a deploy bug: a real agent was
    # supposed to materialize, so log loudly and stash the reason on app.state
    # for /health to surface.
    boot_error: str | None = None
    async with sessionmaker() as session:
        agent_count = await session.scalar(
            select(func.count()).select_from(StandaloneAgentRow)
        )
        agent_count = agent_count or 0
        try:
            engine_config = await assemble_engine_config(session)
        except AssemblyError as exc:
            engine_config = None
            if agent_count > 0:
                boot_error = (
                    f"Agent assembly failed: {exc} "
                    f"DB has {agent_count} agent row(s); "
                    "configured agent will be unreachable."
                )
                logger.error("BOOT FAILED — %s", boot_error)
                logger.error(
                    "/agent/* will return 503 until the config is fixed and "
                    "the engine reloaded."
                )
            else:
                logger.info(
                    "boot engine layer skipped, wizard mode reason=%s", exc
                )

    # Publish the DB-backed prompts to the engine's process-wide snapshot
    # before the engine app boots — the LangGraph adapter's exec_module
    # path runs user code that calls get_prompt() at import time.
    set_active_prompts(engine_config.prompts if engine_config else None)

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
    if boot_error is not None:
        app.state.boot_error = boot_error
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
        _register_trace_detail_routes(app, ui_dir)
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


def _register_trace_detail_routes(app: FastAPI, ui_dir: Path) -> None:
    """Wire the SPA-rewrite routes for ``/admin/traces/{trace_id}``.

    Four URL flavors need explicit declarations:

    * ``/admin/traces/<id>`` and ``/admin/traces/<id>/`` — HTML shell.
      FastAPI's ``redirect_slashes=True`` only redirects ``/foo/`` back
      to ``/foo`` for routes declared without the trailing slash, *not*
      the inverse — and once ``StaticFiles(html=True)`` is mounted at
      ``/``, the slashed form is consumed by the static handler before
      the dynamic route sees it, yielding ``404`` on every link-share /
      Slack-unfurl form. Declaring the slashed sibling route fixes that.
    * ``/admin/traces/<id>/index.txt`` and ``/admin/traces/<id>.txt`` —
      RSC payload. Next 15 in ``output: "export"`` mode prefetches the
      React Flight stream from these paths on hover (``/index.txt``) and
      on ``router.replace`` query-string-only navigations (``.txt``).
      Without an explicit handler the directory form ``404``s and the
      file form gets absorbed by the ``{trace_id}`` HTML route (trace_id
      ends up as ``<id>.txt``), which serves HTML to a client expecting a
      Flight stream — the client then bails to a full hard navigation,
      re-firing ``/runtime-config.js``, ``/sso/info``, ``/auth/me`` and
      the trace fetch on every span click. Serving the placeholder's
      RSC payload here keeps client navigation in-app.

      The ``.txt`` routes are declared **before** the HTML routes so
      FastAPI matches them more specifically — otherwise the
      ``{trace_id}`` path param greedily absorbs the ``.txt`` suffix.

    The selected SPA shell is resolved once at boot (the file layout
    cannot change at runtime and the request handler is on the async
    hot path, so per-request ``Path.is_file()`` syscalls are wasteful
    per ASYNC-001). The resolver prefers the renamed ``_shell/``
    directory shipped by the ``build-standalone-ui`` Make target,
    falls back to the legacy ``__trace__/`` directory when the static
    export was produced by ``pnpm build`` directly (no rename pass),
    and falls back to the root ``index.html`` when neither exists.
    The RSC payload follows the same resolution; when no ``.txt`` is
    present the route returns ``404`` rather than fabricating one — a
    missing RSC payload signals a broken build and shouldn't be papered
    over by serving the HTML shell with the wrong content type.

    The literal ``__trace__`` segment is the build-time placeholder
    path. Even after the rename it remains reachable via the dynamic
    SPA-rewrite if a stale link leaks into the wild — return ``410
    Gone`` so operators see a clear "this isn't a real trace id"
    signal instead of the SPA's softer client-side 404.

    .. todo:: drop the ``__trace__`` legacy fallback once every active
       install has rebuilt with the renamed Make target. Track at one
       release cycle past v0.6 (#608) — the fallback exists only so
       ``e2e/boot-standalone.sh`` and direct ``pnpm build`` workflows
       keep booting without running through ``make build-standalone-ui``.
    """
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    trace_shell_renamed = ui_dir / "admin" / "traces" / "_shell" / "index.html"
    trace_shell_legacy = ui_dir / "admin" / "traces" / "__trace__" / "index.html"
    spa_root_shell = ui_dir / "index.html"
    if trace_shell_renamed.is_file():
        selected_trace_shell = trace_shell_renamed
    elif trace_shell_legacy.is_file():
        selected_trace_shell = trace_shell_legacy
    else:
        selected_trace_shell = spa_root_shell

    trace_rsc_renamed = ui_dir / "admin" / "traces" / "_shell" / "index.txt"
    trace_rsc_legacy = ui_dir / "admin" / "traces" / "__trace__" / "index.txt"
    selected_trace_rsc: Path | None
    if trace_rsc_renamed.is_file():
        selected_trace_rsc = trace_rsc_renamed
    elif trace_rsc_legacy.is_file():
        selected_trace_rsc = trace_rsc_legacy
    else:
        selected_trace_rsc = None

    placeholder_trace_id = "__trace__"

    def _serve_or_410(trace_id: str) -> FileResponse:
        if trace_id == placeholder_trace_id:
            raise HTTPException(
                status_code=410, detail="trace placeholder is not a real id"
            )
        return FileResponse(selected_trace_shell)

    def _serve_rsc_or_410(trace_id: str) -> FileResponse:
        # Placeholder check runs first so stale ``__trace__`` links keep
        # surfacing as ``410 Gone`` even on a broken build that shipped
        # ``index.html`` without ``index.txt`` — operators get the same
        # "this isn't a real trace id" signal as the HTML route.
        if trace_id == placeholder_trace_id:
            raise HTTPException(
                status_code=410, detail="trace placeholder is not a real id"
            )
        if selected_trace_rsc is None:
            raise HTTPException(status_code=404)
        return FileResponse(selected_trace_rsc, media_type="text/x-component")

    @app.get("/admin/traces/{trace_id}/index.txt", include_in_schema=False)
    async def _trace_detail_rsc_dir(trace_id: str) -> FileResponse:
        return _serve_rsc_or_410(trace_id)

    @app.get("/admin/traces/{trace_id}.txt", include_in_schema=False)
    async def _trace_detail_rsc_file(trace_id: str) -> FileResponse:
        return _serve_rsc_or_410(trace_id)

    @app.get("/admin/traces/{trace_id}", include_in_schema=False)
    async def _trace_detail_spa_shell(trace_id: str) -> FileResponse:
        return _serve_or_410(trace_id)

    @app.get("/admin/traces/{trace_id}/", include_in_schema=False)
    async def _trace_detail_spa_shell_slashed(trace_id: str) -> FileResponse:
        return _serve_or_410(trace_id)


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
