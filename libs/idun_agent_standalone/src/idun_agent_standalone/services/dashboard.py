"""Aggregation queries for ``GET /admin/api/v1/dashboard``.

Dialect-dispatched: ``_postgres_*`` paths use ``percentile_cont`` and
``date_trunc``; ``_sqlite_*`` paths fall back to client-side percentile
computation on capped row arrays. Span-name normalization collapses
high-cardinality dynamic arguments before GROUP BY so the Top errors
table stays small.

See ``SPEC.md`` § 5 for the contract.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from idun_agent_schema.standalone.dashboard import (
    CostBlock,
    DashboardRange,
    DashboardResponse,
    ErrorRateBlock,
    LatencyBlock,
    LatencyBucketPoint,
    RequestsBlock,
    TimeBucketPoint,
    TopErrorRow,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_RANGE_TO_SECONDS: dict[DashboardRange, int] = {
    DashboardRange.h1: 60 * 60,
    DashboardRange.h24: 24 * 60 * 60,
    DashboardRange.d7: 7 * 24 * 60 * 60,
    DashboardRange.d30: 30 * 24 * 60 * 60,
}

# Bucket cardinalities target 60-288 buckets per range -- chart-friendly
# without burning a query on too many groups.
_RANGE_TO_BUCKET: dict[DashboardRange, int] = {
    DashboardRange.h1: 60,  # 60 buckets x 1 min
    DashboardRange.h24: 300,  # 288 buckets x 5 min
    DashboardRange.d7: 3_600,  # 168 buckets x 1 h
    DashboardRange.d30: 21_600,  # 120 buckets x 6 h
}


def _resolve_bucket_seconds(range_value: DashboardRange) -> int:
    """Return the bucket width in seconds for the given range."""
    return _RANGE_TO_BUCKET[range_value]


def _resolve_window(
    range_value: DashboardRange,
    *,
    now: datetime | None = None,
) -> tuple[datetime, datetime, datetime]:
    """Return ``(window_start, window_end, prior_window_start)``.

    The prior window is the same width immediately before the current
    window -- used to compute KPI deltas. ``now`` is overridable so
    tests can freeze time.
    """
    end = now or datetime.now(UTC)
    width = timedelta(seconds=_RANGE_TO_SECONDS[range_value])
    start = end - width
    prior_start = end - 2 * width
    return start, end, prior_start


# Span-name normalization -- collapses dynamic args so high-cardinality
# names (e.g. ``execute_tool refund_api/req-abc-123``) don't fragment
# the Top errors table. Conservative on purpose: model-names and
# version tags pass through unchanged.
#
# UUID shape: 3+ dash-separated hex groups of 4+ chars each. Matches
# canonical UUIDs (``8-4-4-4-12``) and our internal worker-id shape
# (``4-4-4-12``). Group-length threshold of 4 keeps short version
# fragments like ``07`` in ``2024-07-18`` from triggering a match.
_UUID_PATTERN = re.compile(
    r"\b[0-9a-f]{4,}(?:-[0-9a-f]{4,}){2,}\b",
    re.IGNORECASE,
)
# Standalone integer: bounded by whitespace or string boundary on
# both sides. Embedded numerics inside hyphenated tokens (model
# names, version tags) pass through unchanged.
_STANDALONE_INT_PATTERN = re.compile(r"(?<!\S)\d+(?!\S)")


def _normalize_span_name(name: str) -> str:
    """Collapse dynamic segments inside a span name.

    Rules:
    1. Drop everything after the first ``/`` (path-style args).
    2. Replace UUID-shaped tokens with the literal ``<uuid>``.
    3. Replace standalone integer tokens with the literal ``<n>``.
    """
    head = name.split("/", 1)[0]
    head = _UUID_PATTERN.sub("<uuid>", head)
    head = _STANDALONE_INT_PATTERN.sub("<n>", head)
    return head


def _delta_pct(current: float | int | None, prior: float | int | None) -> float | None:
    """Return the percentage delta as a decimal fraction, or ``None``."""
    if prior is None or not prior:
        return None
    if current is None:
        return None
    return (float(current) - float(prior)) / float(prior)


def _bucket_floor(ts: datetime, bucket_seconds: int) -> datetime:
    """Floor ``ts`` to the start of its bucket."""
    epoch = ts.timestamp()
    floored = (int(epoch) // bucket_seconds) * bucket_seconds
    return datetime.fromtimestamp(floored, tz=UTC)


def _dialect_is_postgres(session: AsyncSession) -> bool:
    # Matches the helper at ``api/v1/routers/traces.py`` ``_is_postgres``.
    # ``get_bind()`` is the supported AsyncSession accessor; ``.bind``
    # is fine on the sync Session but brittle here.
    return session.get_bind().dialect.name == "postgresql"


async def compute_dashboard(
    session: AsyncSession,
    range_value: DashboardRange,
    *,
    now: datetime | None = None,
) -> DashboardResponse:
    """Run all aggregations for the given range and return the response.

    Dialect-dispatched: routes to ``_postgres_*`` on Postgres, falls
    back to ``_sqlite_*`` otherwise. ``now`` is overridable for tests.
    """
    start, end, prior_start = _resolve_window(range_value, now=now)
    bucket = _resolve_bucket_seconds(range_value)
    is_pg = _dialect_is_postgres(session)

    if is_pg:
        requests = await _postgres_requests(session, start, end, prior_start, bucket)
        latency = await _postgres_latency(session, start, end, prior_start, bucket)
        error_rate = await _postgres_error_rate(
            session, start, end, prior_start, bucket
        )
        cost = await _postgres_cost(session, start, end, prior_start, bucket)
        top_errors = await _postgres_top_errors(session, start, end)
    else:
        requests = await _sqlite_requests(session, start, end, prior_start, bucket)
        latency = await _sqlite_latency(session, start, end, prior_start, bucket)
        error_rate = await _sqlite_error_rate(session, start, end, prior_start, bucket)
        cost = await _sqlite_cost(session, start, end, prior_start, bucket)
        top_errors = await _sqlite_top_errors(session, start, end)

    return DashboardResponse(
        range=range_value,
        generated_at=end,
        bucket_seconds=bucket,
        requests=requests,
        latency=latency,
        error_rate=error_rate,
        cost=cost,
        top_errors=top_errors,
    )


# --- Postgres implementations ---


_PG_REQUESTS_SQL = text(
    """
    SELECT
      date_trunc('seconds', started_at) AT TIME ZONE 'UTC' AS bucket,
      COUNT(*)::bigint AS c
    FROM standalone_trace
    WHERE started_at >= :start AND started_at < :end
    GROUP BY 1
    ORDER BY 1
    """
)


async def _postgres_requests(session, start, end, prior_start, bucket) -> RequestsBlock:
    rows = (await session.execute(_PG_REQUESTS_SQL, {"start": start, "end": end})).all()
    prior = (
        await session.execute(_PG_REQUESTS_SQL, {"start": prior_start, "end": start})
    ).all()
    total = sum(r.c for r in rows)
    prior_total = sum(r.c for r in prior)
    delta = _delta_pct(total, prior_total)
    series = [
        TimeBucketPoint(t=_bucket_floor(r.bucket, bucket), v=float(r.c)) for r in rows
    ]
    return RequestsBlock(total=total, delta_pct=delta, series=series)


_PG_LATENCY_SQL = text(
    """
    WITH bucketed AS (
      SELECT
        to_timestamp(
          floor(extract(epoch FROM started_at) / :bucket) * :bucket
        ) AT TIME ZONE 'UTC' AS bucket,
        latency_ms
      FROM standalone_trace
      WHERE started_at >= :start AND started_at < :end
        AND latency_ms IS NOT NULL
    )
    SELECT
      bucket,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
    """
)

_PG_LATENCY_HEADLINE_SQL = text(
    """
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
    FROM standalone_trace
    WHERE started_at >= :start AND started_at < :end
      AND latency_ms IS NOT NULL
    """
)


async def _postgres_latency(session, start, end, prior_start, bucket) -> LatencyBlock:
    head_row = (
        await session.execute(_PG_LATENCY_HEADLINE_SQL, {"start": start, "end": end})
    ).first()
    prior_row = (
        await session.execute(
            _PG_LATENCY_HEADLINE_SQL, {"start": prior_start, "end": start}
        )
    ).first()
    p50 = float(head_row.p50) if head_row and head_row.p50 is not None else None
    p95 = float(head_row.p95) if head_row and head_row.p95 is not None else None
    prior_p95 = (
        float(prior_row.p95) if prior_row and prior_row.p95 is not None else None
    )
    p95_delta = _delta_pct(p95, prior_p95)

    series_rows = (
        await session.execute(
            _PG_LATENCY_SQL, {"start": start, "end": end, "bucket": bucket}
        )
    ).all()
    series = [
        LatencyBucketPoint(
            t=r.bucket,
            p50=float(r.p50) if r.p50 is not None else None,
            p95=float(r.p95) if r.p95 is not None else None,
        )
        for r in series_rows
    ]
    return LatencyBlock(p50_ms=p50, p95_ms=p95, p95_delta_pct=p95_delta, series=series)


_PG_ERROR_RATE_SQL = text(
    """
    WITH bucketed AS (
      SELECT
        to_timestamp(
          floor(extract(epoch FROM started_at) / :bucket) * :bucket
        ) AT TIME ZONE 'UTC' AS bucket,
        status
      FROM standalone_trace
      WHERE started_at >= :start AND started_at < :end
    )
    SELECT
      bucket,
      SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::float
        / NULLIF(COUNT(*), 0) AS rate
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
    """
)

_PG_ERROR_RATE_HEADLINE_SQL = text(
    """
    SELECT
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::bigint AS errors
    FROM standalone_trace
    WHERE started_at >= :start AND started_at < :end
    """
)


async def _postgres_error_rate(
    session, start, end, prior_start, bucket
) -> ErrorRateBlock:
    head = (
        await session.execute(_PG_ERROR_RATE_HEADLINE_SQL, {"start": start, "end": end})
    ).first()
    prior = (
        await session.execute(
            _PG_ERROR_RATE_HEADLINE_SQL, {"start": prior_start, "end": start}
        )
    ).first()
    value = (head.errors / head.total) if head and head.total else 0.0
    prior_value = (prior.errors / prior.total) if prior and prior.total else None
    delta_pp = (value - prior_value) if prior_value is not None else None

    rows = (
        await session.execute(
            _PG_ERROR_RATE_SQL, {"start": start, "end": end, "bucket": bucket}
        )
    ).all()
    series = [
        TimeBucketPoint(t=r.bucket, v=float(r.rate) if r.rate is not None else 0.0)
        for r in rows
    ]
    return ErrorRateBlock(value_pct=float(value), delta_pp=delta_pp, series=series)


_PG_COST_SQL = text(
    """
    SELECT
      to_timestamp(
        floor(extract(epoch FROM started_at) / :bucket) * :bucket
      ) AT TIME ZONE 'UTC' AS bucket,
      COALESCE(SUM(total_cost_usd), 0)::float AS v
    FROM standalone_trace
    WHERE started_at >= :start AND started_at < :end
    GROUP BY 1
    ORDER BY 1
    """
)

_PG_COST_HEADLINE_SQL = text(
    """
    SELECT COALESCE(SUM(total_cost_usd), 0)::float AS total
    FROM standalone_trace
    WHERE started_at >= :start AND started_at < :end
    """
)


async def _postgres_cost(session, start, end, prior_start, bucket) -> CostBlock:
    head = (
        await session.execute(_PG_COST_HEADLINE_SQL, {"start": start, "end": end})
    ).scalar()
    prior = (
        await session.execute(
            _PG_COST_HEADLINE_SQL, {"start": prior_start, "end": start}
        )
    ).scalar()
    delta = _delta_pct(head, prior)
    rows = (
        await session.execute(
            _PG_COST_SQL, {"start": start, "end": end, "bucket": bucket}
        )
    ).all()
    series = [TimeBucketPoint(t=r.bucket, v=float(r.v)) for r in rows]
    return CostBlock(total_usd=float(head or 0.0), delta_pct=delta, series=series)


_PG_TOP_ERRORS_SQL = text(
    """
    -- standalone_span.otel_trace_id stores only the last 8 bytes of the
    -- 16-byte W3C trace id (see traces.py:486 ``trace_id_8 = trace_id_16[8:]``).
    -- We JOIN back to standalone_trace on that suffix so the
    -- ``sample_trace_id`` we return is the full 32-char hex that
    -- ``/admin/traces/{trace_id}`` accepts.
    SELECT
      sp.name AS span_name,
      COUNT(*)::bigint AS c,
      MAX(sp.started_at) AS last_seen,
      (
        SELECT encode(t2.otel_trace_id, 'hex')
        FROM standalone_span sp2
        JOIN standalone_trace t2
          ON substring(t2.otel_trace_id FROM 9 FOR 8) = sp2.otel_trace_id
         AND t2.started_at >= :start AND t2.started_at < :end
        WHERE sp2.name = sp.name
          AND sp2.status = 'ERROR'
          AND sp2.started_at >= :start AND sp2.started_at < :end
        ORDER BY sp2.started_at DESC
        LIMIT 1
      ) AS sample_trace_hex
    FROM standalone_span sp
    WHERE sp.status = 'ERROR'
      AND sp.started_at >= :start AND sp.started_at < :end
    GROUP BY sp.name
    ORDER BY c DESC
    LIMIT 25
    """
)


async def _postgres_top_errors(session, start, end):
    rows = (
        await session.execute(_PG_TOP_ERRORS_SQL, {"start": start, "end": end})
    ).all()
    # Filter out rows where the JOIN missed (no matching trace -- can
    # happen for transient writes that landed in the span table but
    # whose parent trace hadn't finalized yet). These rows still count
    # toward the error tally but cannot offer a sample trace, so we
    # drop them; the next reload will surface them once finalize runs.
    rows = [r for r in rows if r.sample_trace_hex is not None]
    collapsed: dict[str, dict] = {}
    for r in rows:
        key = _normalize_span_name(r.span_name)
        existing = collapsed.get(key)
        if existing is None:
            collapsed[key] = {
                "span_name": key,
                "count": int(r.c),
                "last_seen": r.last_seen,
                "sample_trace_id": r.sample_trace_hex,
            }
        else:
            existing["count"] += int(r.c)
            if r.last_seen > existing["last_seen"]:
                existing["last_seen"] = r.last_seen
                existing["sample_trace_id"] = r.sample_trace_hex
    ranked = sorted(collapsed.values(), key=lambda d: d["count"], reverse=True)[:5]
    return [TopErrorRow(**d) for d in ranked]


# --- SQLite implementations (stubbed -- Task T1.5 fills them in) ---


async def _sqlite_requests(session, start, end, prior_start, bucket) -> RequestsBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_latency(session, start, end, prior_start, bucket) -> LatencyBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_error_rate(
    session, start, end, prior_start, bucket
) -> ErrorRateBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_cost(session, start, end, prior_start, bucket) -> CostBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_top_errors(session, start, end):
    raise NotImplementedError("Task T1.5")
