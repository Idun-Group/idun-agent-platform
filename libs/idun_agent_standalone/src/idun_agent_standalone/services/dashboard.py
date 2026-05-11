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
    RequestsBlock,
)
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
        error_rate = await _postgres_error_rate(session, start, end, prior_start, bucket)
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


# --- Postgres implementations (stubbed -- Task T1.4 fills them in) ---


async def _postgres_requests(session, start, end, prior_start, bucket) -> RequestsBlock:
    raise NotImplementedError("Task T1.4")


async def _postgres_latency(session, start, end, prior_start, bucket) -> LatencyBlock:
    raise NotImplementedError("Task T1.4")


async def _postgres_error_rate(session, start, end, prior_start, bucket) -> ErrorRateBlock:
    raise NotImplementedError("Task T1.4")


async def _postgres_cost(session, start, end, prior_start, bucket) -> CostBlock:
    raise NotImplementedError("Task T1.4")


async def _postgres_top_errors(session, start, end):
    raise NotImplementedError("Task T1.4")


# --- SQLite implementations (stubbed -- Task T1.5 fills them in) ---


async def _sqlite_requests(session, start, end, prior_start, bucket) -> RequestsBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_latency(session, start, end, prior_start, bucket) -> LatencyBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_error_rate(session, start, end, prior_start, bucket) -> ErrorRateBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_cost(session, start, end, prior_start, bucket) -> CostBlock:
    raise NotImplementedError("Task T1.5")


async def _sqlite_top_errors(session, start, end):
    raise NotImplementedError("Task T1.5")
