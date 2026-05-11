"""Postgres-only integration tests for the dashboard service.

Skipped unless ``PYTEST_POSTGRES_URL`` is set. Uses real partitioned
trace + span tables so we exercise ``percentile_cont`` and
``date_trunc`` rather than the SQLite fallbacks.

Schema setup mirrors ``tests/integration/db/test_writer_pg_copy_path.py``:
runs the packaged Alembic migrations against the env-supplied PG URL so
production and tests share the same DDL path
(``idun_agent_standalone.db.migrate.upgrade_head``). The alembic env
runs ``asyncio.run`` internally, so we hop through ``asyncio.to_thread``
to give it a dedicated worker thread and avoid nesting event loops.
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest
from idun_agent_schema.standalone.dashboard import DashboardRange
from idun_agent_standalone.db.migrate import downgrade_base, upgrade_head
from idun_agent_standalone.infrastructure.db.models.span import (
    StandaloneSpanRow,  # noqa: F401
)
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.services.dashboard import compute_dashboard
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

pytestmark = pytest.mark.requires_postgres

POSTGRES_URL = os.environ.get("PYTEST_POSTGRES_URL")


@pytest.fixture
async def pg_session(monkeypatch):
    if not POSTGRES_URL:
        pytest.skip("PYTEST_POSTGRES_URL not set")
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    # Reset state before upgrade so a previous test that crashed mid-run
    # cannot leave dirty schema for this one. ``downgrade_base`` is a
    # no-op on an empty / unstamped database, so this is safe to call
    # unconditionally as a setup-time fence.
    await asyncio.to_thread(downgrade_base)
    await asyncio.to_thread(upgrade_head)
    engine = create_async_engine(POSTGRES_URL)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sm() as session:
            yield session
    finally:
        await engine.dispose()
        # Leave the DB in a clean state for the next test run.
        await asyncio.to_thread(downgrade_base)


async def test_requests_aggregation_returns_count_and_series(pg_session):
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    rows = [
        _trace(now - timedelta(hours=1), b"\x01" * 16, status="OK"),
        _trace(now - timedelta(hours=5), b"\x02" * 16, status="OK"),
        _trace(now - timedelta(hours=23), b"\x03" * 16, status="ERROR"),
        _trace(now - timedelta(hours=25), b"\x04" * 16, status="OK"),
    ]
    pg_session.add_all(rows)
    await pg_session.commit()

    resp = await compute_dashboard(pg_session, DashboardRange.h24, now=now)
    assert resp.requests.total == 3
    assert len(resp.requests.series) > 0
    assert resp.error_rate.value_pct == pytest.approx(1 / 3)


async def test_latency_percentiles_from_postgres(pg_session):
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    rows = [
        _trace(
            now - timedelta(minutes=10 + i),
            bytes([0x10 + i]) * 16,
            latency_ms=100 * (i + 1),
            status="OK",
        )
        for i in range(10)
    ]
    pg_session.add_all(rows)
    await pg_session.commit()

    resp = await compute_dashboard(pg_session, DashboardRange.h1, now=now)
    assert 450 <= resp.latency.p50_ms <= 600
    assert 850 <= resp.latency.p95_ms <= 1000


def _trace(started_at, trace_id, *, status="OK", latency_ms=200.0, cost=0.01):
    return StandaloneTraceRow(
        started_at=started_at,
        otel_trace_id=trace_id,
        name="root",
        status=status,
        latency_ms=latency_ms,
        total_cost_usd=cost,
        ended_at=started_at + timedelta(milliseconds=latency_ms),
    )
