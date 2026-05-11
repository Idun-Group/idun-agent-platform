"""Regression: agent whose runtime OTel context leaks a parent must still
produce a ``standalone_trace`` row.

Reported live against ``idun-assistant`` (LangGraph + Gemini + 4 MCP
servers) on 2026-05-11. Some library in that agent's import graph leaves
an active OTel span in runtime context; the OpenInference LangChain
instrumentor inherits it as parent for every top-level run, so
``_finalizer.build_trace_rows`` (which requires ``parent_span_id IS None``
in the batch) never emits a trace row.

This test simulates the leak with ``tracer.start_as_current_span(...)``
held active across a ``RunnableLambda.invoke()`` call. With the
``separate_trace_from_runtime_context=True`` flag set by the bootstrap,
the LangChain span ignores the leaked parent and starts a fresh trace,
which the finalizer recognises and persists.
"""

from __future__ import annotations

import asyncio

import pytest
from alembic import command
from fastapi import FastAPI
from idun_agent_engine.observability import otel_lifecycle
from idun_agent_standalone.db.migrate import _alembic_config
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.infrastructure.traces.bootstrap import attach_trace_pipeline
from langchain_core.runnables import RunnableLambda
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

_DRAIN_TIMEOUT_S = 5.0
_DRAIN_TICK_S = 0.05


async def _wait_for(predicate, *, timeout_s: float = _DRAIN_TIMEOUT_S) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        if await predicate():
            return True
        await asyncio.sleep(_DRAIN_TICK_S)
    return False


@pytest.mark.asyncio
async def test_runtime_context_leak_still_produces_trace_row(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'leak.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)

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

        async def _has_trace() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneTraceRow)
                    )
                ).scalar_one()
                return count >= 1

        assert await _wait_for(_has_trace), (
            "no trace row materialized within "
            f"{_DRAIN_TIMEOUT_S}s — the leak fix did not take effect"
        )

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
            ), (
                "expected RunnableLambda span with parent_span_id IS NULL; "
                f"got {rows!r}"
            )

            trace_names = (
                (await session.execute(select(StandaloneTraceRow.name))).scalars().all()
            )
            assert "leak_probe" in trace_names, (
                "expected a trace row for the LangChain runnable; "
                f"got {trace_names!r}"
            )
    finally:
        if getattr(app.state, "trace_writer_task", None) is not None:
            await app.state.trace_writer_task.stop()
        if getattr(app.state, "trace_retention_task", None) is not None:
            await app.state.trace_retention_task.stop()
        await engine.dispose()
        otel_lifecycle.shutdown_otel()
