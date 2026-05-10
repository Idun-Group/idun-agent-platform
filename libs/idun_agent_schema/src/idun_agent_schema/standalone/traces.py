"""Standalone trace + span admin contracts.

The trace admin REST surface is collection-scoped and addresses
individual traces by their hex-encoded W3C ``otel_trace_id``. The
storage layer keeps the id as raw bytes (16 bytes for the trace row,
an 8-byte slice for span rows); the wire format is hex everywhere so
JSON stays clean.

Schema source: ``tasks/trace-feature-08-05-2026/README.md`` decision
``§29`` (admin REST shape) and ``§28`` (depth-limited recursive CTE
for span tree assembly).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from ._base import _CamelModel


class StandaloneTraceListItem(_CamelModel):
    """One row in ``GET /admin/api/v1/traces`` list response.

    ``otel_trace_id`` is the lowercase hex encoding of the 16-byte
    W3C trace id. The DB stores raw bytes; routers convert at the
    boundary so JSON consumers never see a binary blob.
    """

    otel_trace_id: str
    name: str
    started_at: datetime
    ended_at: datetime | None = None
    latency_ms: float | None = None
    total_tokens: int | None = None
    total_cost_usd: float | None = None
    models: list[str] = Field(default_factory=list)
    status: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class StandaloneSpanRead(_CamelModel):
    """One span read from the standalone_span table.

    ``otel_span_id`` and ``parent_span_id`` are 8-byte hex strings.
    ``otel_trace_id`` is the 8-byte slice of the parent trace id (the
    span table only stores the trailing half — see the exporter).
    """

    otel_span_id: str
    otel_trace_id: str
    parent_span_id: str | None = None
    name: str
    kind: str
    started_at: datetime
    ended_at: datetime | None = None
    latency_ms: float | None = None
    model: str | None = None
    provider: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    cost_breakdown: dict[str, Any] | None = None
    cost_source: str | None = None
    status: str | None = None
    attributes: dict[str, Any] | None = None
    events: list[dict[str, Any]] | None = None


class StandaloneSpanTreeNode(_CamelModel):
    """Recursive node carrying a span and its children.

    The router builds the tree in Python from the flat recursive-CTE
    result. Depth is capped at 32 (decision ``§28``).
    """

    span: StandaloneSpanRead
    children: list[StandaloneSpanTreeNode] = Field(default_factory=list)


# Pydantic 2 needs an explicit rebuild so the forward reference resolves.
StandaloneSpanTreeNode.model_rebuild()


class StandaloneTraceDetail(_CamelModel):
    """Body of ``GET /admin/api/v1/traces/{otel_trace_id}``.

    ``tree`` holds the top-level spans of the trace. Orphan spans
    (those whose ``parent_span_id`` is not present in the same trace,
    e.g. truncated traces or cross-trace links) are also surfaced as
    roots so the UI never silently hides them.
    """

    trace: StandaloneTraceListItem
    tree: list[StandaloneSpanTreeNode] = Field(default_factory=list)


class StandaloneTraceListFilters(_CamelModel):
    """Query-parameter model for ``GET /admin/api/v1/traces``.

    Pagination is cursor-based on ``(started_at DESC, otel_trace_id)``;
    the ``cursor`` field is an opaque base64url-encoded payload the
    router round-trips without exposing the shape on the wire.
    """

    started_after: datetime | None = None
    started_before: datetime | None = None
    model: str | None = None
    status: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    name_contains: str | None = None
    limit: int = Field(default=50, ge=1, le=500)
    cursor: str | None = None


class StandaloneTraceHealth(_CamelModel):
    """Body of ``GET /admin/api/v1/traces/_health``.

    Reflects the running ``StandaloneSpanExporter``'s queue. When the
    trace pipeline is not attached (engine booted without traces) the
    router returns zeroes + ``writer_running=False`` instead of 404 so
    the UI panel can render a stable "pipeline idle" state.

    ``database_dialect`` lets the UI conditionally render the SQLite
    operational banner without a second round-trip; it mirrors the
    SQLAlchemy bind dialect name (``"sqlite"`` or ``"postgresql"``)
    and falls back to ``"unknown"`` when no bind is reachable.
    """

    queue_depth: int
    max_queue_size: int
    overflow_count: int
    writer_running: bool
    database_dialect: str = "unknown"


class StandaloneTraceDeleteResult(_CamelModel):
    """Body of a single ``DELETE /admin/api/v1/traces/{id}`` response.

    Reports the deleted trace plus the cascaded span count so the UI
    can show "removed N spans" without a follow-up read.
    """

    deleted: Literal[True] = True
    deleted_spans: int


class StandaloneTraceBulkDeleteResult(_CamelModel):
    """Body of ``DELETE /admin/api/v1/traces`` (bulk by filter).

    The filter shape mirrors :class:`StandaloneTraceListFilters` (minus
    ``limit`` / ``cursor``); the response counts what was removed.
    """

    deleted_traces: int
    deleted_spans: int


class StandaloneTraceListResponse(_CamelModel):
    """Envelope for the list view.

    ``next_cursor`` is the opaque cursor for the next page or ``None``
    when the current page is the last one. ``total_estimate`` is left
    ``None`` on SQLite (count is expensive) and reserved for a fast
    PG estimate via ``pg_class.reltuples`` in a later iteration.
    """

    items: list[StandaloneTraceListItem] = Field(default_factory=list)
    next_cursor: str | None = None
    total_estimate: int | None = None
