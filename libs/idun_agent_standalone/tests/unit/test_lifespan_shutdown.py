"""Regression tests for the standalone lifespan teardown order.

The lifespan finally-block must stop the trace writer + retention
tasks **before** disposing the SQLAlchemy AsyncEngine. Otherwise the
writer's next ``_drain_once`` (which opens a session) and the
retention scheduler's daily job race against a closed connection
pool and surface as noise in shutdown logs.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from types import TracebackType
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings


@pytest.mark.asyncio
async def test_lifespan_stops_trace_tasks_before_db_engine_dispose(monkeypatch):
    """Order: writer.stop() → retention.stop() → db_engine.dispose().

    Drives the same shutdown branch the production app does. We mock
    every component so the test stays at unit level and never opens
    a real socket.
    """
    from idun_agent_standalone import app as app_module

    # Track shutdown call order through a single recorder.
    order: list[str] = []
    writer = AsyncMock()
    writer.stop = AsyncMock(side_effect=lambda: order.append("writer.stop"))
    retention = AsyncMock()
    retention.stop = AsyncMock(side_effect=lambda: order.append("retention.stop"))
    db_engine = AsyncMock()
    db_engine.dispose = AsyncMock(side_effect=lambda: order.append("db.dispose"))

    # Patch the engine factory dependencies that ``create_standalone_app``
    # would normally hit on real boot.
    fake_settings = StandaloneSettings(
        auth_mode=AuthMode.NONE,
        database_url="sqlite+aiosqlite:///:memory:",
        session_secret="x" * 32,
    )

    monkeypatch.setattr(app_module, "create_db_engine", lambda *a, **kw: db_engine)
    # ``sessionmaker()`` must return an async-context manager because
    # ``create_standalone_app`` opens a session against it on boot.
    class _StubSession:
        async def __aenter__(self) -> _StubSession:
            return self

        async def __aexit__(
            self,
            exc_type: type[BaseException] | None,
            exc: BaseException | None,
            tb: TracebackType | None,
        ) -> None:
            return None

    monkeypatch.setattr(
        app_module, "create_sessionmaker", lambda *a, **kw: lambda: _StubSession()
    )

    async def _no_assemble(*_a: object, **_kw: object) -> None:
        return None

    monkeypatch.setattr(app_module, "assemble_engine_config", _no_assemble)

    @asynccontextmanager
    async def _no_op_lifespan(_app: FastAPI):
        yield

    fake_engine_app = FastAPI()
    fake_engine_app.router.lifespan_context = _no_op_lifespan
    monkeypatch.setattr(app_module, "create_engine_app", lambda **kw: fake_engine_app)

    # ``register_admin_exception_handlers`` and friends touch routers we
    # don't care about for this test -- stub them.
    monkeypatch.setattr(
        app_module, "register_standalone_routers", lambda *a, **kw: None
    )
    monkeypatch.setattr(
        app_module, "register_admin_exception_handlers", lambda *a, **kw: None
    )
    monkeypatch.setattr(
        app_module, "_install_engine_runtime_gate", lambda *a, **kw: None
    )
    monkeypatch.setattr(app_module, "_resolve_ui_dir", lambda *a, **kw: None)

    app = await app_module.create_standalone_app(fake_settings)

    # Inject the trace tasks the bootstrap callback would normally have
    # set on app.state.
    app.state.trace_writer_task = writer
    app.state.trace_retention_task = retention

    lifespan = app.router.lifespan_context
    async with lifespan(app):
        pass  # noqa: SIM117

    # All three were called, and writer/retention precede db.dispose.
    assert order == ["writer.stop", "retention.stop", "db.dispose"], order

    # Idempotency: the lifespan clears the slots after stop.
    assert getattr(app.state, "trace_writer_task", None) is None
    assert getattr(app.state, "trace_retention_task", None) is None


@pytest.mark.asyncio
async def test_lifespan_disposes_engine_when_no_trace_tasks(monkeypatch):
    """Admin-only mode: bootstrap callback never fired; lifespan still works.

    No ``trace_writer_task`` / ``trace_retention_task`` attrs exist
    on ``app.state`` -- the finally-block must skip them and still
    dispose the DB engine.
    """
    from idun_agent_standalone import app as app_module

    db_engine = AsyncMock()
    db_engine.dispose = AsyncMock()
    fake_settings = StandaloneSettings(
        auth_mode=AuthMode.NONE,
        database_url="sqlite+aiosqlite:///:memory:",
        session_secret="x" * 32,
    )
    monkeypatch.setattr(app_module, "create_db_engine", lambda *a, **kw: db_engine)
    # ``sessionmaker()`` must return an async-context manager because
    # ``create_standalone_app`` opens a session against it on boot.
    class _StubSession:
        async def __aenter__(self) -> _StubSession:
            return self

        async def __aexit__(
            self,
            exc_type: type[BaseException] | None,
            exc: BaseException | None,
            tb: TracebackType | None,
        ) -> None:
            return None

    monkeypatch.setattr(
        app_module, "create_sessionmaker", lambda *a, **kw: lambda: _StubSession()
    )

    async def _no_assemble(*_a: object, **_kw: object) -> None:
        return None

    monkeypatch.setattr(app_module, "assemble_engine_config", _no_assemble)

    @asynccontextmanager
    async def _no_op_lifespan(_app: FastAPI):
        yield

    fake_engine_app = FastAPI()
    fake_engine_app.router.lifespan_context = _no_op_lifespan
    monkeypatch.setattr(app_module, "create_engine_app", lambda **kw: fake_engine_app)
    monkeypatch.setattr(
        app_module, "register_standalone_routers", lambda *a, **kw: None
    )
    monkeypatch.setattr(
        app_module, "register_admin_exception_handlers", lambda *a, **kw: None
    )
    monkeypatch.setattr(
        app_module, "_install_engine_runtime_gate", lambda *a, **kw: None
    )
    monkeypatch.setattr(app_module, "_resolve_ui_dir", lambda *a, **kw: None)

    app = await app_module.create_standalone_app(fake_settings)

    lifespan = app.router.lifespan_context
    async with lifespan(app):
        pass  # noqa: SIM117

    db_engine.dispose.assert_awaited_once()
