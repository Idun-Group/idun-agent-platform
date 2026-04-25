"""Compose engine + admin REST + traces capture + runtime config + static UI.

This is the production app factory used by ``idun-standalone serve``. It
- runs Alembic migrations
- seeds the DB from YAML if empty
- creates the engine app via ``idun_agent_engine.create_app`` (Phase 0
  upstream changes; passes our admin auth dep so /reload is gated in
  password mode)
- mounts admin routers, the /runtime-config.js endpoint, and the static
  UI (the engine handles IDUN_UI_DIR; if neither it nor the bundled
  ``static/`` exists, ``/`` falls back to the engine info page)
- attaches the run-event observer that pipes AG-UI events into the
  trace_event table via a batched async writer.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from idun_agent_engine import create_app as create_engine_app
from idun_agent_engine.server.lifespan import cleanup_agent, configure_app

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.admin.routers import (
    agent as agent_router,
)
from idun_agent_standalone.admin.routers import (
    auth as auth_router,
)
from idun_agent_standalone.admin.routers import (
    config as config_router,
)
from idun_agent_standalone.admin.routers import (
    guardrails as guardrails_router,
)
from idun_agent_standalone.admin.routers import (
    health as health_router,
)
from idun_agent_standalone.admin.routers import (
    integrations as integrations_router,
)
from idun_agent_standalone.admin.routers import (
    mcp_servers as mcp_router,
)
from idun_agent_standalone.admin.routers import (
    memory as memory_router,
)
from idun_agent_standalone.admin.routers import (
    observability as observability_router,
)
from idun_agent_standalone.admin.routers import (
    prompts as prompts_router,
)
from idun_agent_standalone.admin.routers import (
    theme as theme_router,
)
from idun_agent_standalone.admin.routers import (
    traces as traces_router,
)
from idun_agent_standalone.config_assembly import assemble_engine_config
from idun_agent_standalone.config_io import (
    compute_config_hash,
    get_bootstrap_hash,
    is_db_empty,
    record_bootstrap_hash,
    seed_from_yaml,
)
from idun_agent_standalone.db.base import (
    create_db_engine as _create_db_engine,
)
from idun_agent_standalone.db.base import (
    create_sessionmaker as _create_sessionmaker,
)
from idun_agent_standalone.errors import install_exception_handlers
from idun_agent_standalone.middleware import (
    install_proxy_headers_middleware,
    install_request_id_middleware,
    install_session_refresh_middleware,
)
from idun_agent_standalone.reload import ReloadOutcome, orchestrate_reload
from idun_agent_standalone.settings import StandaloneSettings
from idun_agent_standalone.theme.runtime_config import router as runtime_config_router
from idun_agent_standalone.traces.observer import make_observer
from idun_agent_standalone.traces.retention import (
    purge_once,
    start_retention_scheduler,
    stop_retention_scheduler,
)
from idun_agent_standalone.traces.sink import DatabaseTraceSink
from idun_agent_standalone.traces.writer import BatchedTraceWriter

logger = logging.getLogger(__name__)


async def _bootstrap_if_needed(settings: StandaloneSettings, sm) -> None:
    """Seed from ``IDUN_CONFIG_PATH`` on first boot, warn on YAML drift after.

    Spec §3.1 — the YAML is bootstrap-only. Subsequent edits go through
    the admin REST surface; the on-disk file becomes a stale snapshot.
    Operators get a one-line warning when the YAML hash drifts so they
    know to re-export (``GET /admin/api/v1/config/export``) or stop
    editing the file.
    """
    if not settings.config_path.exists():
        return

    yaml_bytes = settings.config_path.read_bytes()
    current_hash = compute_config_hash(yaml_bytes)

    async with sm() as session:
        if await is_db_empty(session):
            await seed_from_yaml(session, settings.config_path)
            await record_bootstrap_hash(session, current_hash)
            await session.commit()
            return

        stored_hash = await get_bootstrap_hash(session)
        if stored_hash is None:
            # Pre-migration DB — record the current hash without warning.
            await record_bootstrap_hash(session, current_hash)
            await session.commit()
            return

        if stored_hash != current_hash:
            logger.warning(
                "IDUN_CONFIG_PATH YAML hash differs from bootstrap hash "
                "(yaml=%s..., bootstrap=%s...). The DB is the source of "
                "truth after first boot — edits to the file are ignored. "
                "Use GET /admin/api/v1/config/export to refresh the file.",
                current_hash[:8],
                stored_hash[:8],
            )


async def _bootstrap_admin_user(settings: StandaloneSettings, sm) -> None:
    """Sync the bcrypt hash from ``IDUN_ADMIN_PASSWORD_HASH`` into ``admin_user``.

    Runs on every boot (not just first) so rotating the env var rotates
    the stored hash. No-op when ``auth_mode != PASSWORD`` (the login
    route short-circuits in ``none`` mode anyway). Without this the
    login route always returns 401 because the row never exists.
    """
    from sqlalchemy import select

    from idun_agent_standalone.db.models import AdminUserRow
    from idun_agent_standalone.settings import AuthMode

    if settings.auth_mode != AuthMode.PASSWORD:
        return
    if not settings.admin_password_hash:
        return

    async with sm() as session:
        existing = (
            await session.execute(select(AdminUserRow))
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                AdminUserRow(
                    id="admin", password_hash=settings.admin_password_hash
                )
            )
        elif existing.password_hash != settings.admin_password_hash:
            existing.password_hash = settings.admin_password_hash
        await session.commit()


def _make_reload_orchestrator():
    """Bind a closure that admin routers call after every committed mutation.

    The freshly built agent inherits the trace observer via the engine's
    ``post_configure_callbacks`` hook (registered once at boot in
    ``create_standalone_app``), so this orchestrator no longer needs to
    re-attach manually — the engine's own ``POST /reload`` and the admin
    code path now share one re-attach mechanism.
    """

    async def _trigger(request, db_session) -> JSONResponse | None:
        previous_cfg = getattr(request.app.state, "current_engine_config", None)
        new_cfg = await assemble_engine_config(db_session)

        # Per spec D11/§3.6: only framework (agent.type) and graph_definition
        # are structural — a name change can hot-swap.
        structural = previous_cfg is not None and (
            previous_cfg.agent.type != new_cfg.agent.type
            or getattr(previous_cfg.agent.config, "graph_definition", None)
            != getattr(new_cfg.agent.config, "graph_definition", None)
        )

        engine_agent = getattr(request.app.state, "agent", None)
        if engine_agent is None:
            # No live engine to swap (test / pre-lifespan); persist only.
            request.app.state.current_engine_config = new_cfg
            return None

        outcome: ReloadOutcome = await orchestrate_reload(
            app=request.app,
            new_config=new_cfg,
            previous_config=previous_cfg,
            structural_change=structural,
            cleanup=cleanup_agent,
            configure=configure_app,
        )
        request.app.state.current_engine_config = new_cfg

        if outcome.kind == "restart_required":
            return JSONResponse(status_code=202, content={"restart_required": True})
        if outcome.kind == "init_failed":
            return JSONResponse(
                status_code=500,
                content={
                    "error": "engine_init_failed",
                    "message": outcome.message,
                    "recovered": outcome.recovered,
                },
            )

        return None

    return _trigger


def _resolve_ui_dir(settings: StandaloneSettings) -> Path | None:
    """Return a UI directory iff it actually contains a built SPA.

    Presence of ``index.html`` is the signal — the bundled ``static/``
    directory is shipped with only a ``.gitkeep`` placeholder until the
    UI build pipeline (Phase 14) drops a real export there.
    """
    if settings.ui_dir:
        p = Path(settings.ui_dir)
        if p.is_dir() and (p / "index.html").is_file():
            return p
    bundled = Path(__file__).parent / "static"
    if bundled.is_dir() and (bundled / "index.html").is_file():
        return bundled
    return None


async def create_standalone_app(settings: StandaloneSettings) -> FastAPI:
    """Build the production FastAPI app.

    NOTE: ``upgrade_head()`` is NOT called here because Alembic's env.py
    spins up its own ``asyncio.run`` and would clash with the loop already
    running this coroutine. Callers must run migrations in sync context
    before invoking this helper. ``runtime.run_server`` does so.
    """
    settings.validate_for_runtime()

    db_engine = _create_db_engine(settings.database_url)
    sessionmaker = _create_sessionmaker(db_engine)
    await _bootstrap_if_needed(settings, sessionmaker)
    await _bootstrap_admin_user(settings, sessionmaker)

    async with sessionmaker() as s:
        engine_config = await assemble_engine_config(s)

    # IMPORTANT: do NOT set IDUN_UI_DIR before create_engine_app — the
    # engine's _maybe_mount_static_ui registers a "/" catch-all that
    # would shadow every standalone route added later. We mount static
    # OURSELVES at the end of this factory, after every admin/runtime-
    # config router. The engine's info JSON falls back at /_engine/info.
    import os

    saved_ui_dir = os.environ.pop("IDUN_UI_DIR", None)
    try:
        app = create_engine_app(
            engine_config=engine_config, reload_auth=require_auth
        )
    finally:
        if saved_ui_dir is not None:
            os.environ["IDUN_UI_DIR"] = saved_ui_dir

    install_request_id_middleware(app)
    install_proxy_headers_middleware(app)
    install_session_refresh_middleware(app)
    install_exception_handlers(app)

    app.state.settings = settings
    app.state.db_engine = db_engine
    app.state.sessionmaker = sessionmaker
    app.state.current_engine_config = engine_config

    # Traces capture
    trace_sink = DatabaseTraceSink(sessionmaker)
    trace_writer = BatchedTraceWriter(
        sink=trace_sink, batch_size=25, max_latency_ms=250
    )
    app.state.trace_writer = trace_writer

    # Build a single observer closure that's reused for the boot agent
    # AND every subsequent hot-swap. Per-run sequence numbers live inside
    # the closure keyed by ``thread_id:run_id`` so reload doesn't disturb
    # them.
    trace_observer = make_observer(trace_writer)
    app.state.trace_observer = trace_observer

    # Register the trace re-attach callback on the engine so EVERY
    # ``configure_app`` invocation — boot, admin reload, AND the engine's
    # own ``POST /reload`` route — wires our observer onto the freshly
    # built agent. Without this, the engine's own /reload silently drops
    # the trace pipeline because it rebuilds ``app.state.agent`` and the
    # standalone never sees the swap.
    async def _reattach_trace_observer(_app: FastAPI) -> None:
        agent = getattr(_app.state, "agent", None)
        if agent is None:
            logger.warning(
                "post_configure callback fired with no agent on app.state — "
                "skipping trace observer re-attach"
            )
            return
        agent.register_run_event_observer(trace_observer)
        logger.debug(
            "re-attached trace observer to agent (%s) via post_configure",
            type(agent).__name__,
        )

    app.state.post_configure_callbacks = [_reattach_trace_observer]

    # The admin reload orchestrator no longer needs the observer in its
    # closure — the engine fires the re-attach callback after every
    # ``configure_app`` call.
    app.state.reload_orchestrator = _make_reload_orchestrator()

    # The engine builds the app with `lifespan=...`; FastAPI then ignores
    # `@app.on_event("startup")` decorators. Wrap the engine's lifespan so
    # we can register the observer AFTER the engine has set
    # `app.state.agent`, and drain the trace writer on shutdown.
    from contextlib import asynccontextmanager

    engine_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def _standalone_lifespan(_app):
        async with engine_lifespan(_app):
            await trace_writer.start()
            # The engine's ``configure_app`` already invoked our
            # ``_reattach_trace_observer`` callback during boot, so the
            # observer is wired onto ``_app.state.agent``. We only log
            # here for operator visibility.
            agent = getattr(_app.state, "agent", None)
            if agent is not None:
                logger.info(
                    "trace observer attached on agent (%s)",
                    type(agent).__name__,
                )
            else:
                logger.warning(
                    "no agent on app.state — traces will not be captured"
                )
            # Catch up any backlog from before this boot, then schedule
            # the hourly job. ``start_retention_scheduler`` returns None
            # when ``traces_retention_days <= 0`` so disabling is a no-op.
            try:
                await purge_once(sessionmaker, settings.traces_retention_days)
            except Exception:  # noqa: BLE001
                logger.exception("startup trace retention purge failed")
            retention_scheduler = start_retention_scheduler(
                sessionmaker, settings.traces_retention_days
            )
            try:
                yield
            finally:
                stop_retention_scheduler(retention_scheduler)
                await trace_writer.drain()
                await db_engine.dispose()

    app.router.lifespan_context = _standalone_lifespan

    # Admin REST + runtime config (theme is included; included BEFORE the
    # engine's /reload route so dependencies resolve in expected order).
    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.include_router(agent_router.router)
    app.include_router(guardrails_router.router)
    app.include_router(memory_router.router)
    app.include_router(observability_router.router)
    app.include_router(theme_router.router)
    app.include_router(mcp_router.router)
    app.include_router(prompts_router.router)
    app.include_router(integrations_router.router)
    app.include_router(traces_router.router)
    app.include_router(config_router.router)
    app.include_router(runtime_config_router)

    # Mount the static UI LAST so the catch-all at "/" doesn't shadow
    # any route registered above. We also drop the engine's default "/"
    # JSON info route so the SPA index serves at /; /_engine/info is
    # still available.
    ui_dir = _resolve_ui_dir(settings)
    if ui_dir is not None:
        from fastapi.routing import APIRoute
        from fastapi.staticfiles import StaticFiles

        app.router.routes = [
            r
            for r in app.router.routes
            if not (isinstance(r, APIRoute) and r.path == "/")
        ]
        app.mount(
            "/", StaticFiles(directory=str(ui_dir), html=True), name="ui"
        )
        logger.info("mounted standalone UI at / from %s", ui_dir)

    return app


async def create_standalone_app_for_testing() -> FastAPI:
    """Backward-compat alias used by Phase 1 health-only tests."""
    from idun_agent_standalone.testing_app import make_test_app

    app, _ = await make_test_app()
    return app
