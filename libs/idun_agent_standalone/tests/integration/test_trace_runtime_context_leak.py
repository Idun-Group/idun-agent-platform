"""Runtime-context leak: a top-level LangChain span whose runtime OTel
context carries an unknown parent must still produce a trace row.
PG-gated; mirrors ``db/test_writer_pg_copy_path`` harness."""

from __future__ import annotations

import asyncio
import os

import pytest
from alembic import command
from fastapi import FastAPI
from idun_agent_engine.observability import otel_lifecycle
from idun_agent_standalone.db.migrate import _alembic_config, downgrade_base
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.infrastructure.traces.bootstrap import attach_trace_pipeline
from langchain_core.runnables import RunnableLambda
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

_DRAIN_TIMEOUT_S = 5.0
_DRAIN_TICK_S = 0.05


pytestmark = pytest.mark.skipif(
    not os.getenv("STANDALONE_TEST_POSTGRES_URL"),
    reason="STANDALONE_TEST_POSTGRES_URL not set; PG runtime-context-leak test skipped",
)


async def _make_pg_pipeline(monkeypatch):
    url = os.environ["STANDALONE_TEST_POSTGRES_URL"]
    monkeypatch.setenv("DATABASE_URL", url)
    await asyncio.to_thread(downgrade_base)
    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    return engine, sm


async def _wait_for(predicate, *, timeout_s: float = _DRAIN_TIMEOUT_S) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    while loop.time() < deadline:
        if await predicate():
            return True
        await asyncio.sleep(_DRAIN_TICK_S)
    return False


@pytest.mark.asyncio
async def test_runtime_context_leak_still_produces_trace_row(monkeypatch):
    engine, sm = await _make_pg_pipeline(monkeypatch)

    otel_lifecycle.shutdown_otel()
    app = FastAPI()
    app.state.sessionmaker = sm
    app.state.engine_config = None
    await attach_trace_pipeline(app)

    try:
        tracer = otel_lifecycle.get_tracer_provider().get_tracer("test.runtime_leak")
        with tracer.start_as_current_span("simulated_runtime_leak"):
            runnable = RunnableLambda(lambda x: x + 1).with_config(
                run_name="leak_probe"
            )
            await runnable.ainvoke(1)

        otel_lifecycle.get_tracer_provider().force_flush()

        async def _has_leak_probe_trace() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count())
                        .select_from(StandaloneTraceRow)
                        .where(StandaloneTraceRow.name == "leak_probe")
                    )
                ).scalar_one()
                return count >= 1

        assert await _wait_for(
            _has_leak_probe_trace
        ), f"no leak_probe trace row materialized within {_DRAIN_TIMEOUT_S}s"

        async with sm() as session:
            rows = (
                await session.execute(
                    select(
                        StandaloneSpanRow.name, StandaloneSpanRow.parent_span_id
                    ).order_by(StandaloneSpanRow.started_at)
                )
            ).all()
            assert any(
                name == "leak_probe" and parent is None for name, parent in rows
            ), f"expected leak_probe span with parent IS NULL; got {rows!r}"

            trace_names = (
                (await session.execute(select(StandaloneTraceRow.name))).scalars().all()
            )
            assert (
                "leak_probe" in trace_names
            ), f"expected a trace row for leak_probe; got {trace_names!r}"
    finally:
        # Nested try/finally so a failure in an earlier stop never blocks
        # the next cleanup step — otherwise a flaky writer.stop() can
        # leak the OTel TracerProvider and the Alembic schema into the
        # next test in the integration suite.
        try:
            if getattr(app.state, "trace_writer_task", None) is not None:
                await app.state.trace_writer_task.stop()
        finally:
            try:
                if getattr(app.state, "trace_retention_task", None) is not None:
                    await app.state.trace_retention_task.stop()
            finally:
                try:
                    await engine.dispose()
                finally:
                    try:
                        otel_lifecycle.shutdown_otel()
                    finally:
                        await asyncio.to_thread(downgrade_base)
