"""End-to-end PG smoke for the asyncpg COPY span writer.

Gated on ``STANDALONE_TEST_POSTGRES_URL`` so the test runs in CI (P2)
and locally when the operator has a PG fixture; SKIPs cleanly on
laptops without PG.

Mirrors the structure of ``tests/integration/test_trace_e2e_sqlite.py``
(alembic-driven schema setup via ``asyncio.to_thread`` so the running
event loop does not nest the ``asyncio.run`` inside the alembic env).

What this test asserts that the unit-level writer tests do not is the
shape of the round-trip through real Postgres: COPY records actually
land in ``standalone_span``, JSONB columns come back as the original
dicts (no double-encoding), and the client-side dedupe layer absorbs
duplicate ``(started_at, otel_span_id)`` pairs in a single batch.

Locked design:
~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/18-postgres-throughput-probe.md §1.4
"""

from __future__ import annotations

import asyncio
import os

import pytest
from alembic import command
from idun_agent_standalone.db.migrate import _alembic_config, downgrade_base
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.traces.exporter import (
    StandaloneSpanExporter,
)
from idun_agent_standalone.infrastructure.traces.writer import TraceWriter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tests.unit.traces._helpers import fake_span as _fake_span

_DRAIN_TIMEOUT_S = 5.0
_DRAIN_TICK_S = 0.05


pytestmark = pytest.mark.skipif(
    not os.getenv("STANDALONE_TEST_POSTGRES_URL"),
    reason="STANDALONE_TEST_POSTGRES_URL not set; PG writer COPY smoke skipped",
)


async def _make_pg_pipeline(monkeypatch):
    """Materialize the standalone schema by running the packaged Alembic
    migrations against the env-supplied PG URL.

    The alembic env runs its async upgrade via ``asyncio.run``; calling
    it from a running event loop would nest loops, so we hop through
    ``asyncio.to_thread`` to give it a dedicated worker thread (same
    pattern as ``test_trace_e2e_sqlite.py``).

    Returns the engine + sessionmaker; caller owns disposal + a
    ``downgrade_base`` to leave the DB in a clean state for the next
    test run.
    """
    url = os.environ["STANDALONE_TEST_POSTGRES_URL"]
    monkeypatch.setenv("DATABASE_URL", url)
    # Reset state before upgrade so a previous test that crashed mid-run
    # cannot leave dirty schema for this one. ``downgrade_base`` is a
    # no-op on an empty / unstamped database, so this is safe to call
    # unconditionally as a setup-time fence.
    await asyncio.to_thread(downgrade_base)
    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    return engine, sm


async def _wait_for(predicate, *, timeout_s: float = _DRAIN_TIMEOUT_S) -> bool:
    """Poll ``predicate`` until truthy or ``timeout_s`` elapses."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    while loop.time() < deadline:
        if await predicate():
            return True
        await asyncio.sleep(_DRAIN_TICK_S)
    return False


@pytest.mark.asyncio
async def test_pg_copy_writer_lands_100_spans_across_3_traces(monkeypatch):
    """100 spans across 3 traces drained through the writer land in
    ``standalone_span`` via the asyncpg COPY path.
    """
    engine, sm = await _make_pg_pipeline(monkeypatch)
    exporter = StandaloneSpanExporter(max_queue_size=200)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        max_export_batch_size=200,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_ids = [
            0xCAFEBABE_DEADBEEF_CAFEBABE_DEADBEE0,
            0xCAFEBABE_DEADBEEF_CAFEBABE_DEADBEE1,
            0xCAFEBABE_DEADBEEF_CAFEBABE_DEADBEE2,
        ]
        spans = []
        for i in range(100):
            trace_id = trace_ids[i % 3]
            spans.append(
                _fake_span(
                    f"llm.call.{i}",
                    span_id=0x1000 + i,
                    trace_id=trace_id,
                    parent_span_id=0x99,
                    attributes={
                        "openinference.span.kind": "LLM",
                        "llm.model_name": "gpt-4o-mini",
                        "marker.idx": i,
                    },
                )
            )
        exporter.export(spans)

        async def _spans_landed() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            return count == 100

        assert await _wait_for(_spans_landed), (
            "writer did not drain 100 spans into standalone_span within "
            f"{_DRAIN_TIMEOUT_S}s"
        )

        # JSONB round-trip: the COPY path serializes ``attributes`` via
        # ``json.dumps``; PG's JSONB decoder must turn it back into a
        # dict (no double-encoded string).
        async with sm() as session:
            rows = (
                (
                    await session.execute(
                        select(StandaloneSpanRow).order_by(
                            StandaloneSpanRow.otel_span_id
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert len(rows) == 100
        # Spot-check: ``attributes`` must come back as a dict with the
        # original ``marker.idx`` key intact.
        sample = rows[0]
        assert isinstance(sample.attributes, dict)
        assert "marker.idx" in sample.attributes
        assert sample.attributes["openinference.span.kind"] == "LLM"
    finally:
        await writer.stop()
        await engine.dispose()
        await asyncio.to_thread(downgrade_base)


@pytest.mark.asyncio
async def test_pg_copy_writer_dedupes_duplicate_spans_in_single_batch(monkeypatch):
    """Pushing 50 spans + the same 50 again in a single batch lands 50
    rows — the client-side dedupe layer preserves the previous
    ``ON CONFLICT DO NOTHING`` semantics now that asyncpg COPY does not
    support that clause.
    """
    engine, sm = await _make_pg_pipeline(monkeypatch)
    exporter = StandaloneSpanExporter(max_queue_size=200)
    writer = TraceWriter(
        exporter=exporter,
        session_factory=sm,
        # Big enough that both the original 50 and the duplicates land
        # in the same drained batch (so dedupe runs against them as a
        # group).
        max_export_batch_size=200,
        schedule_delay_millis=50,
    )
    await writer.start()
    try:
        trace_id = 0xDEADBEEF_DEADBEEF_DEADBEEF_DEADBEEF
        # Build 50 spans with deterministic span_ids so we can re-emit
        # the exact same (started_at, otel_span_id) pairs.
        originals = [
            _fake_span(
                f"llm.call.{i}",
                span_id=0x2000 + i,
                trace_id=trace_id,
                parent_span_id=0x99,
                start_time_ns=1_700_000_000_000_000_000 + i * 1_000_000,
                end_time_ns=1_700_000_001_000_000_000 + i * 1_000_000,
                attributes={
                    "openinference.span.kind": "LLM",
                    "llm.model_name": "gpt-4o-mini",
                    "marker.idx": i,
                },
            )
            for i in range(50)
        ]
        # Re-emit identical spans so the writer sees both the originals
        # and a duplicate set in a single drained batch.
        duplicates = [
            _fake_span(
                f"llm.call.{i}",
                span_id=0x2000 + i,
                trace_id=trace_id,
                parent_span_id=0x99,
                start_time_ns=1_700_000_000_000_000_000 + i * 1_000_000,
                end_time_ns=1_700_000_001_000_000_000 + i * 1_000_000,
                attributes={
                    "openinference.span.kind": "LLM",
                    "llm.model_name": "gpt-4o-mini",
                    "marker.idx": i,
                },
            )
            for i in range(50)
        ]
        exporter.export(originals + duplicates)

        async def _spans_landed() -> bool:
            async with sm() as session:
                count = (
                    await session.execute(
                        select(func.count()).select_from(StandaloneSpanRow)
                    )
                ).scalar()
            return count == 50

        assert await _wait_for(_spans_landed), (
            "writer did not drain the deduped 50 spans into standalone_span "
            f"within {_DRAIN_TIMEOUT_S}s"
        )

        # Confirm there are exactly 50 rows; if the dedupe layer were
        # absent, asyncpg COPY would raise a unique-constraint error
        # (no ON CONFLICT support) and the fail-open writer would drop
        # the entire batch — i.e. count == 0. Either count != 50 means
        # the dedupe regressed.
        async with sm() as session:
            count = (
                await session.execute(
                    select(func.count()).select_from(StandaloneSpanRow)
                )
            ).scalar()
        assert count == 50
    finally:
        await writer.stop()
        await engine.dispose()
        await asyncio.to_thread(downgrade_base)
