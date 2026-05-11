"""SQLite-path tests for the dashboard service.

SQLite doesn't have ``percentile_cont``. We pull capped row arrays and
compute percentiles in Python. Tests use an in-memory SQLite fixture
that materializes the trace + span ORMs via ``Base.metadata.create_all``.

Note: production SQLite installs apply alembic migrations, but for unit
tests of the dashboard service the schema-create-all path is acceptable
because the only types under test are the dashboard's pure aggregation
logic, not column-type fidelity. ORM tests for column-type drift live
in the trace-pipeline test surface.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from idun_agent_schema.standalone.dashboard import DashboardRange
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow
from idun_agent_standalone.services.dashboard import compute_dashboard


async def test_sqlite_requests_and_error_rate(async_session):
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    async_session.add_all(
        [
            _trace(now - timedelta(minutes=10), b"\x01" * 16, status="OK"),
            _trace(now - timedelta(minutes=20), b"\x02" * 16, status="OK"),
            _trace(now - timedelta(minutes=30), b"\x03" * 16, status="ERROR"),
        ]
    )
    await async_session.commit()

    resp = await compute_dashboard(async_session, DashboardRange.h1, now=now)
    assert resp.requests.total == 3
    assert resp.error_rate.value_pct == pytest.approx(1 / 3)


async def test_sqlite_latency_percentile_fallback(async_session):
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    async_session.add_all(
        [
            _trace(
                now - timedelta(minutes=i),
                bytes([0x10 + i]) * 16,
                latency_ms=100 * (i + 1),
            )
            for i in range(10)
        ]
    )
    await async_session.commit()

    resp = await compute_dashboard(async_session, DashboardRange.h1, now=now)
    # p50 of [100, 200, ..., 1000] via linear interpolation is 550; p95 is 955
    assert resp.latency.p50_ms == pytest.approx(550.0, rel=0.1)
    assert resp.latency.p95_ms == pytest.approx(950.0, rel=0.1)


async def test_sqlite_top_errors_groups_on_span_name(async_session):
    now = datetime(2026, 5, 11, 16, 0, 0, tzinfo=UTC)
    # 16-byte trace_id; spans store the last 8 bytes.
    trace_id_16 = b"\xaa" * 16
    trace_id_8 = trace_id_16[8:]
    async_session.add(_trace(now - timedelta(minutes=5), trace_id_16, status="ERROR"))
    async_session.add_all(
        [
            StandaloneSpanRow(
                started_at=now - timedelta(minutes=5, seconds=i),
                otel_span_id=bytes([i + 1]) * 8,
                otel_trace_id=trace_id_8,
                name="execute_tool refund_api",
                kind="TOOL",
                status="ERROR",
            )
            for i in range(3)
        ]
    )
    await async_session.commit()

    resp = await compute_dashboard(async_session, DashboardRange.h1, now=now)
    assert len(resp.top_errors) == 1
    assert resp.top_errors[0].span_name == "execute_tool refund_api"
    assert resp.top_errors[0].count == 3
    # 32-char hex of the FULL 16-byte trace_id, not the 8-byte suffix.
    assert resp.top_errors[0].sample_trace_id == trace_id_16.hex()
    assert len(resp.top_errors[0].sample_trace_id) == 32


def _trace(started_at, trace_id, *, status="OK", latency_ms=200.0, cost=0.01):
    return StandaloneTraceRow(
        started_at=started_at,
        otel_trace_id=trace_id,
        name="root",
        status=status,
        latency_ms=latency_ms,
        total_cost_usd=cost,
        ended_at=started_at + timedelta(milliseconds=int(latency_ms)),
    )
