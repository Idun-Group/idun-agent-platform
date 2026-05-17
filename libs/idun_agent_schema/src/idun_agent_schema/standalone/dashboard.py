"""Pydantic response models for ``GET /admin/api/v1/dashboard``.

The endpoint returns one JSON document covering all five v1 widgets:
requests, latency, error_rate, cost, top_errors. Empty windows return
the same shape with ``total: 0``, ``delta_*: null``, ``series: []``,
``top_errors: []``.

Wire format is camelCase via the standalone ``_CamelModel`` base. The
SPA's typed client mirrors these shapes.

See ``SPEC.md`` § 5 for the contract.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from idun_agent_schema.standalone._base import _CamelModel


class DashboardRange(StrEnum):
    """Time-range filter values accepted by the dashboard endpoint."""

    h1 = "1h"
    h24 = "24h"
    d7 = "7d"
    d30 = "30d"


class TimeBucketPoint(_CamelModel):
    """Single (timestamp, value) point in a time series."""

    t: datetime
    v: float


class LatencyBucketPoint(_CamelModel):
    """Single (timestamp, p50, p95) point in the latency time series."""

    t: datetime
    p50: float | None = None
    p95: float | None = None


class RequestsBlock(_CamelModel):
    """Headline + series for the Requests widget."""

    total: int
    delta_pct: float | None = None
    series: list[TimeBucketPoint] = []


class LatencyBlock(_CamelModel):
    """Headline + series for the Latency p50 / p95 widget."""

    p50_ms: float | None = None
    p95_ms: float | None = None
    p95_delta_pct: float | None = None
    series: list[LatencyBucketPoint] = []


class ErrorRateBlock(_CamelModel):
    """Headline + series for the Error rate widget.

    ``value_pct`` is a decimal fraction (0.0042 means 0.42 %).
    ``delta_pp`` is a percentage-point delta as a decimal fraction
    (-0.001 means the error rate dropped by 0.1 pp; NOT a relative %).
    """

    value_pct: float
    delta_pp: float | None = None
    series: list[TimeBucketPoint] = []


class CostBlock(_CamelModel):
    """Headline + series for the Total cost widget."""

    total_usd: float
    delta_pct: float | None = None
    series: list[TimeBucketPoint] = []


class TopErrorRow(_CamelModel):
    """One row of the Top errors table.

    Grouped by failing span name. The current exporter does not preserve
    OTel exception event attributes (``exception.type`` /
    ``exception.message``), so granular error types come from drilling
    into the sample trace. See SPEC § 4 row 5.
    """

    span_name: str
    count: int
    last_seen: datetime
    sample_trace_id: str


class DashboardResponse(_CamelModel):
    """Top-level dashboard payload returned by ``GET /admin/api/v1/dashboard``."""

    range: DashboardRange
    generated_at: datetime
    bucket_seconds: int
    requests: RequestsBlock
    latency: LatencyBlock
    error_rate: ErrorRateBlock
    cost: CostBlock
    top_errors: list[TopErrorRow] = []
