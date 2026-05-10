"""Unit tests for the trace writer task."""

from __future__ import annotations

import asyncio

import pytest
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.infrastructure.traces import writer as writer_module
from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from idun_agent_standalone.infrastructure.traces.writer import TraceWriter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Cross-test import sentinel: PLAN's writer test asks for ``_fake_span``
# from ``tests.unit.traces.test_exporter``. We re-export it from the
# helpers module so the symbol is available in either place.
from tests.unit.traces._helpers import fake_span as _fake_span


@pytest.mark.asyncio
async def test_writer_drains_queue_into_sqlite(tmp_path):
    """Spans pushed onto the exporter's queue land in the SQLite DB."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'tw.db'}"

    # Create tables via SQLAlchemy metadata (alembic adds GENERATED columns
    # on PG, but SQLite has no analogue — the writer stamps total_tokens
    # explicitly, so a plain create_all is the right shape here).
    setup_engine = create_async_engine(url)
    async with setup_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await setup_engine.dispose()

    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        exporter.export([_fake_span() for _ in range(5)])
        # Allow the writer enough loop ticks to drain.
        for _ in range(40):
            await asyncio.sleep(0.05)
            async with sm() as session:
                from idun_agent_standalone.infrastructure.db.models.span import (
                    StandaloneSpanRow,
                )
                from sqlalchemy import func, select

                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            if count == 5:
                break
    finally:
        await writer.stop()
        await engine.dispose()

    assert count == 5


@pytest.mark.asyncio
async def test_writer_failopen_logs_and_continues(tmp_path, caplog):
    """A batch insert failure is logged but the writer keeps going."""
    import logging

    url = f"sqlite+aiosqlite:///{tmp_path / 'fail.db'}"
    # Intentionally do NOT create tables — INSERT will fail.
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    exporter = StandaloneSpanExporter(max_queue_size=10)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=5,
        schedule_delay_millis=20,
    )
    with caplog.at_level(logging.ERROR, logger=writer_module.logger.name):
        await writer.start()
        try:
            exporter.export([_fake_span() for _ in range(3)])
            await asyncio.sleep(0.2)
        finally:
            await writer.stop()
            await engine.dispose()

    # Writer task must have logged the batch failure and continued (no
    # uncaught exception escaped through the wait_for in stop()).
    failure_records = [
        r for r in caplog.records if "trace writer batch insert failed" in r.message
    ]
    assert failure_records, "writer must log batch failures, not propagate"


# ---------------------------------------------------------------------------
# Trace-row finalizer tests (T7 — closes T3 gap so trace list view is non-empty)
# ---------------------------------------------------------------------------


async def _make_writer_db(tmp_path, name: str = "trace.db"):
    """Build an aiosqlite engine + sessionmaker with all standalone tables."""
    url = f"sqlite+aiosqlite:///{tmp_path / name}"
    setup_engine = create_async_engine(url)
    async with setup_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await setup_engine.dispose()
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    return engine, sm


@pytest.mark.asyncio
async def test_writer_finalizes_trace_row_when_root_span_present(tmp_path):
    """Root span + 2 children → one trace row with aggregates.

    Tokens, cost, latency, models, status all aggregate across the batch.
    """
    engine, sm = await _make_writer_db(tmp_path, "fin_root.db")
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_id = 0xCAFEBABE_DEADBEEF_CAFEBABE_DEADBEEF
        # Root: span_id=0x1, parent=None, latest end_time
        root = _fake_span(
            "agent.run",
            span_id=0x1,
            trace_id=trace_id,
            parent_span_id=None,
            start_time_ns=1_700_000_000_000_000_000,
            end_time_ns=1_700_000_005_000_000_000,
            attributes={
                "openinference.span.kind": "CHAIN",
                "user.id": "user-42",
                "session.id": "sess-7",
            },
        )
        child1 = _fake_span(
            "llm.call",
            span_id=0x2,
            trace_id=trace_id,
            parent_span_id=0x1,
            start_time_ns=1_700_000_001_000_000_000,
            end_time_ns=1_700_000_003_000_000_000,
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o",
            },
        )
        child2 = _fake_span(
            "llm.call.2",
            span_id=0x3,
            trace_id=trace_id,
            parent_span_id=0x1,
            start_time_ns=1_700_000_002_000_000_000,
            end_time_ns=1_700_000_004_000_000_000,
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o-mini",
            },
        )
        exporter.export([root, child1, child2])

        for _ in range(40):
            await asyncio.sleep(0.05)
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneTraceRow)
                    )
                ).scalar()
            if count == 1:
                break
    finally:
        await writer.stop()
        await engine.dispose()

    assert count == 1, f"expected exactly one trace row, got {count}"
    async with sm() as session:
        traces = (await session.execute(select(StandaloneTraceRow))).scalars().all()
    [trace] = traces
    # otel_trace_id is 16 bytes for the trace table
    assert len(trace.otel_trace_id) == 16
    assert trace.name == "agent.run"
    assert trace.status == "OK"
    # latency_ms = MAX(ended_at) - MIN(started_at) in millis. The
    # absolute timestamps round-trip through SQLite as naive datetimes
    # (no native tz support); the *gap* between min-start and max-end
    # is what the design KB calls out as the load-bearing aggregate.
    assert trace.started_at is not None
    assert trace.ended_at is not None
    assert (trace.ended_at - trace.started_at).total_seconds() == pytest.approx(5.0)
    assert float(trace.latency_ms) == pytest.approx(5_000.0)
    # User / session pulled from span attributes
    assert trace.user_id == "user-42"
    assert trace.session_id == "sess-7"
    # Models — sorted distinct from LLM children
    assert sorted(trace.models or []) == ["gpt-4o", "gpt-4o-mini"]
    assert trace.tags == []


@pytest.mark.asyncio
async def test_writer_skips_trace_row_when_no_root_in_batch(tmp_path):
    """Orphan-span batch (no parent_span_id IS None) → no trace row inserted.

    Spans whose parents already finalized in a prior batch should land as
    span rows but must NOT trigger a trace insert. The trace row is only
    materialized when the root span itself is in the batch.
    """
    engine, sm = await _make_writer_db(tmp_path, "fin_no_root.db")
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_id = 0xFACEFEED_FACEFEED_FACEFEED_FACEFEED
        orphan1 = _fake_span(
            "tool.call",
            span_id=0x10,
            trace_id=trace_id,
            parent_span_id=0x99,  # parent NOT in this batch
        )
        orphan2 = _fake_span(
            "tool.call.2",
            span_id=0x11,
            trace_id=trace_id,
            parent_span_id=0x99,
        )
        exporter.export([orphan1, orphan2])

        for _ in range(20):
            await asyncio.sleep(0.05)
            async with sm() as session:
                span_count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            if span_count == 2:
                break
        # Give the writer one extra tick to make sure it's not still
        # racing to write a trace row.
        await asyncio.sleep(0.15)
        async with sm() as session:
            trace_count = (
                await session.execute(
                    select(func.count()).select_from(StandaloneTraceRow)
                )
            ).scalar()
    finally:
        await writer.stop()
        await engine.dispose()

    assert span_count == 2
    assert trace_count == 0, "orphan-span batch must not finalize a trace row"


@pytest.mark.asyncio
async def test_writer_trace_status_error_when_any_span_errored(tmp_path):
    """Root span + 1 child where 1 span has status=ERROR → trace.status == 'ERROR'."""
    engine, sm = await _make_writer_db(tmp_path, "fin_err.db")
    exporter = StandaloneSpanExporter(max_queue_size=100)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=10,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_id = 0xBADC0FFEE_BADC0FFEE_BADC0FFEE_BADC0FFE & ((1 << 128) - 1)
        # Root succeeds; child fails.
        root = _fake_span(
            "agent.run",
            span_id=0x21,
            trace_id=trace_id,
            parent_span_id=None,
            attributes={"openinference.span.kind": "CHAIN"},
        )
        child_failed = _fake_span(
            "llm.call",
            span_id=0x22,
            trace_id=trace_id,
            parent_span_id=0x21,
            status_code=2,  # OTel ERROR
            attributes={
                "openinference.span.kind": "LLM",
                "llm.model_name": "gpt-4o",
            },
        )
        exporter.export([root, child_failed])

        trace = None
        for _ in range(40):
            await asyncio.sleep(0.05)
            async with sm() as session:
                rows = (
                    (await session.execute(select(StandaloneTraceRow))).scalars().all()
                )
            if rows:
                trace = rows[0]
                break
    finally:
        await writer.stop()
        await engine.dispose()

    assert trace is not None
    assert trace.status == "ERROR"
