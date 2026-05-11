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

from idun_agent_schema.standalone.dashboard import DashboardRange

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
