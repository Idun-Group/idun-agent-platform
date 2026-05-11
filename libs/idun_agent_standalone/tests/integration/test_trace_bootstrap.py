"""Integration tests for ``attach_trace_pipeline`` (T7 bootstrap).

Drives the post_configure callback directly without spinning up the
whole engine — the callback is the only thing this test cares about.
A minimal FastAPI app is built with ``app.state.sessionmaker`` set,
the callback is awaited, and the resulting state on ``app.state`` is
asserted.

The reload-twice scenario verifies idempotency: the callback must
stop the previous writer + retention before respawning, and it must
not leak duplicate exporters or BatchSpanProcessors.
"""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from idun_agent_engine.observability import otel_lifecycle
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.infrastructure.traces.bootstrap import (
    attach_trace_pipeline,
)
from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

logger = logging.getLogger(__name__)


@pytest.fixture
async def sessionmaker_factory():
    """Real aiosqlite sessionmaker so the writer's first drain has somewhere
    to land -- a bare MagicMock would crash the writer's _drain_once loop.

    Repo guideline (services/idun_agent_standalone_ui CLAUDE.md and
    libs/idun_agent_standalone/CLAUDE.md): integration tests use
    in-memory SQLite. We share a single engine across the schema
    setup and the sessionmaker so the in-memory DB is the same one
    the writer's session opens against.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    yield sm
    await engine.dispose()


@pytest.fixture(autouse=True)
def _reset_otel_after_test():
    """Drain otel_lifecycle module state between tests.

    The helper holds module-level singletons (TracerProvider, processor
    list). Without this, a test that left a TracerProvider installed
    would taint the next test's idempotency check.
    """
    yield
    try:
        otel_lifecycle.shutdown_otel()
    except Exception:
        # Surface teardown failures so a regression in
        # ``otel_lifecycle.shutdown_otel`` (e.g. a None TracerProvider
        # crash) is visible in CI logs instead of silently masked.
        logger.exception("otel_lifecycle.shutdown_otel raised on teardown")


@pytest.mark.asyncio
async def test_attach_trace_pipeline_sets_state_on_first_boot(sessionmaker_factory):
    """First boot installs exporter + spawns writer + retention tasks."""
    app = FastAPI()
    app.state.sessionmaker = sessionmaker_factory
    app.state.engine_config = None  # no provider → self-install path

    try:
        await attach_trace_pipeline(app)

        assert isinstance(app.state.trace_exporter, StandaloneSpanExporter)
        assert app.state.trace_writer_task is not None
        assert app.state.trace_retention_task is not None
        # The writer's underlying asyncio task must be live.
        underlying = app.state.trace_writer_task._task
        assert underlying is not None
        assert not underlying.done()
    finally:
        # Clean up writer + retention tasks so the test loop teardown
        # doesn't see orphan asyncio tasks.
        if getattr(app.state, "trace_writer_task", None) is not None:
            await app.state.trace_writer_task.stop()
        if getattr(app.state, "trace_retention_task", None) is not None:
            await app.state.trace_retention_task.stop()


@pytest.mark.asyncio
async def test_attach_trace_pipeline_is_idempotent_on_reload(sessionmaker_factory):
    """Second invocation stops the previous writer/retention before respawning.

    Acceptance: the prior writer is stopped (its underlying task is
    done) and a new one is in place. The exporter may be a fresh
    instance (the engine's shutdown_otel drained the prior processor's
    queue indirectly via cleanup_agent in production) — what matters
    is that no duplicate background tasks linger.
    """
    app = FastAPI()
    app.state.sessionmaker = sessionmaker_factory
    app.state.engine_config = None

    try:
        await attach_trace_pipeline(app)
        first_writer = app.state.trace_writer_task
        first_retention = app.state.trace_retention_task
        first_underlying = first_writer._task

        # Simulate a reload — engine cleanup drains otel_lifecycle.
        otel_lifecycle.shutdown_otel()

        await attach_trace_pipeline(app)

        second_writer = app.state.trace_writer_task
        second_retention = app.state.trace_retention_task

        # The prior writer must have been stopped (its asyncio.Task
        # object is None after stop() or completed). The instance
        # itself must be a different one — otherwise we'd be sharing a
        # cancelled task.
        assert second_writer is not first_writer
        assert second_retention is not first_retention
        # The first writer's underlying asyncio task is now finished.
        assert first_writer._task is None or first_underlying.done()
        # The second writer is live.
        assert second_writer._task is not None
        assert not second_writer._task.done()
    finally:
        if getattr(app.state, "trace_writer_task", None) is not None:
            await app.state.trace_writer_task.stop()
        if getattr(app.state, "trace_retention_task", None) is not None:
            await app.state.trace_retention_task.stop()


@pytest.mark.asyncio
async def test_attach_trace_pipeline_surfaces_instrumentor_dependency_conflict(
    sessionmaker_factory, monkeypatch
):
    """Dep conflict must flip ``trace_instrumentor_status`` and skip attach.

    Simulates the production failure where a pre-release ``langchain-core``
    fails the OpenInference instrumentor's metadata constraint. The
    bootstrap must:

      * read the conflict via ``_check_dependency_conflicts``,
      * NOT call ``attach_instrumentor`` (which would silently no-op),
      * persist the status + message on ``app.state`` so ``/_health``
        can surface it.
    """
    from openinference.instrumentation.langchain import LangChainInstrumentor

    fake_conflict = "requested: langchain_core>=0.1.0 but found: langchain_core 1.4.0a2"

    def _fake_conflict_check(self):  # noqa: ANN001 — bound method shape
        return fake_conflict

    monkeypatch.setattr(
        LangChainInstrumentor,
        "_check_dependency_conflicts",
        _fake_conflict_check,
        raising=False,
    )

    # Track whether attach_instrumentor would be called (it must NOT).
    from idun_agent_engine.observability import otel_lifecycle as _ol

    attach_calls: list[object] = []
    original_attach = _ol.attach_instrumentor
    monkeypatch.setattr(
        _ol,
        "attach_instrumentor",
        lambda inst: attach_calls.append(inst),
    )

    app = FastAPI()
    app.state.sessionmaker = sessionmaker_factory
    app.state.engine_config = None

    try:
        await attach_trace_pipeline(app)

        assert app.state.trace_instrumentor_status == "dependency_conflict"
        assert "langchain_core" in (app.state.trace_instrumentor_message or "")
        # The bootstrap must skip attach entirely on conflict.
        assert attach_calls == []
        # Writer + exporter still spawn — the failure is per-instrumentor,
        # not per-pipeline. (Some operator paths run alternative
        # instrumentors via env or observability provider; the writer
        # stays alive to capture whatever lands on the TracerProvider.)
        assert isinstance(app.state.trace_exporter, StandaloneSpanExporter)
    finally:
        monkeypatch.setattr(_ol, "attach_instrumentor", original_attach)
        if getattr(app.state, "trace_writer_task", None) is not None:
            await app.state.trace_writer_task.stop()
        if getattr(app.state, "trace_retention_task", None) is not None:
            await app.state.trace_retention_task.stop()


@pytest.mark.asyncio
async def test_attach_trace_pipeline_failopen_when_sessionmaker_missing():
    """Missing app.state.sessionmaker must log and continue — never raise.

    Telemetry must never alter command/runtime semantics. A bootstrap
    callback exception would otherwise propagate up into the engine's
    configure_app → reload pipeline and surface as a reload failure
    even though the agent itself is fine.
    """
    app = FastAPI()
    # Intentionally NOT setting app.state.sessionmaker.
    app.state.engine_config = None

    # The callback must NOT raise.
    await attach_trace_pipeline(app)

    # Writer/retention should not have been spawned without a session
    # factory — but the absence of those attrs is the signal, not an
    # exception.
    assert getattr(app.state, "trace_writer_task", None) is None
    assert getattr(app.state, "trace_retention_task", None) is None



@pytest.mark.asyncio
async def test_attach_trace_pipeline_passes_separate_trace_flag(
    sessionmaker_factory, monkeypatch
):
    """The self-install LangChainInstrumentor path must pass
    ``separate_trace_from_runtime_context=True`` so a leaked active span
    in OTel runtime context never parents a top-level LangChain run.

    Without this flag, ``_finalizer.build_trace_rows`` never emits trace
    rows for agents whose imports/init leave a span in OTel runtime
    context (live regression on idun-assistant: Gemini + four MCP
    servers, 2026-05-11).
    """
    from idun_agent_engine.observability import otel_lifecycle as _ol

    recorded_kwargs: dict[str, object] = {}
    original_attach = _ol.attach_instrumentor

    def _recorder(instrumentor, **kwargs):
        recorded_kwargs.update(kwargs)
        recorded_kwargs["__instrumentor"] = instrumentor

    monkeypatch.setattr(_ol, "attach_instrumentor", _recorder)

    app = FastAPI()
    app.state.sessionmaker = sessionmaker_factory
    app.state.engine_config = None

    try:
        await attach_trace_pipeline(app)
        assert recorded_kwargs.get("separate_trace_from_runtime_context") is True
        assert recorded_kwargs.get("__instrumentor") is not None
    finally:
        monkeypatch.setattr(_ol, "attach_instrumentor", original_attach)
        if getattr(app.state, "trace_writer_task", None) is not None:
            await app.state.trace_writer_task.stop()
        if getattr(app.state, "trace_retention_task", None) is not None:
            await app.state.trace_retention_task.stop()
