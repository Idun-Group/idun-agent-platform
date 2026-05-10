"""``/admin/api/v1/traces`` router.

Read + delete surface over the standalone trace storage. Routes are
gated by the same admin auth as every other admin namespace; the
underlying tables are the ``standalone_trace`` (one row per execution)
and ``standalone_span`` (per-OpenInference span) created in the T1
migration.

Decision sources:
- ``tasks/trace-feature-08-05-2026/README.md`` §29 (admin REST shape)
- ``tasks/trace-feature-08-05-2026/README.md`` §28 (depth-32 recursive
  CTE for tree assembly).

Trace ids are 16 bytes (full W3C trace id) on ``standalone_trace`` and
8 bytes (trailing slice) on ``standalone_span``. The wire format is
lowercase hex everywhere; the router handles the bytes <-> hex
boundary so JSON consumers never see raw bytes.
"""

from __future__ import annotations

import base64
import binascii
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneSpanRead,
    StandaloneSpanTreeNode,
    StandaloneTraceBulkDeleteResult,
    StandaloneTraceDeleteResult,
    StandaloneTraceDetail,
    StandaloneTraceHealth,
    StandaloneTraceListFilters,
    StandaloneTraceListItem,
    StandaloneTraceListResponse,
)
from sqlalchemy import String, cast, delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import SessionDep, require_auth
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow

router = APIRouter(
    prefix="/admin/api/v1/traces",
    tags=["Traces"],
    dependencies=[Depends(require_auth)],
)

logger = get_logger(__name__)

# Decision §28: cap span tree at 32 levels to bound runaway-agent
# response size. The CTE seed row counts as level 1; recursion adds
# one level per round, capped at ``_MAX_DEPTH_LEVELS`` total.
_MAX_DEPTH_LEVELS = 32


def _row_to_list_item(row: StandaloneTraceRow) -> StandaloneTraceListItem:
    """Translate a ``StandaloneTraceRow`` into the wire model.

    ``Numeric`` columns surface as ``Decimal`` on PG; cast to ``float``
    so JSON serialization matches the schema's declared type.
    """
    return StandaloneTraceListItem(
        otel_trace_id=row.otel_trace_id.hex(),
        name=row.name,
        started_at=row.started_at,
        ended_at=row.ended_at,
        latency_ms=float(row.latency_ms) if row.latency_ms is not None else None,
        total_tokens=row.total_tokens,
        total_cost_usd=(
            float(row.total_cost_usd) if row.total_cost_usd is not None else None
        ),
        models=list(row.models or []),
        status=row.status,
        user_id=row.user_id,
        session_id=row.session_id,
        tags=list(row.tags or []),
    )


def _encode_cursor(started_at: datetime, otel_trace_id: bytes) -> str:
    """Pack a list-page cursor as base64url JSON."""
    payload = {
        "started_at": started_at.isoformat(),
        "otel_trace_id": otel_trace_id.hex(),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, bytes]:
    """Reverse :func:`_encode_cursor`; raise on malformed input.

    Padding is restored before decoding because :func:`_encode_cursor`
    strips trailing ``=`` to keep the cursor URL-safe.
    """
    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + padding)
        payload = json.loads(raw.decode("utf-8"))
        started_at = datetime.fromisoformat(payload["started_at"])
        otel_trace_id = bytes.fromhex(payload["otel_trace_id"])
    except (ValueError, KeyError, binascii.Error, json.JSONDecodeError) as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Malformed cursor.",
            ),
        ) from exc
    return started_at, otel_trace_id


def _is_postgres(session: AsyncSession) -> bool:
    """Branch on dialect for free-text + ARRAY filters."""
    return session.get_bind().dialect.name == "postgresql"


def _apply_filters(
    stmt: Any,
    filters: StandaloneTraceListFilters,
    *,
    is_postgres: bool,
) -> Any:
    """Apply filter clauses to ``select(StandaloneTraceRow)``.

    PG: ``ILIKE %name%`` (the trgm GIN engages) + native ARRAY
    containment.
    SQLite: ``LIKE 'name%'`` for free-text (prefix-only — SPEC §T6) and
    a textual LIKE on the JSON-serialized models column for ARRAY
    membership. SQLite is documented as a demo-only path so this is
    intentionally cheap.
    """
    if filters.started_after is not None:
        stmt = stmt.where(StandaloneTraceRow.started_at >= filters.started_after)
    if filters.started_before is not None:
        stmt = stmt.where(StandaloneTraceRow.started_at < filters.started_before)
    if filters.status is not None:
        stmt = stmt.where(StandaloneTraceRow.status == filters.status)
    if filters.user_id is not None:
        stmt = stmt.where(StandaloneTraceRow.user_id == filters.user_id)
    if filters.session_id is not None:
        stmt = stmt.where(StandaloneTraceRow.session_id == filters.session_id)
    if filters.name_contains is not None:
        if is_postgres:
            stmt = stmt.where(
                StandaloneTraceRow.name.ilike(f"%{filters.name_contains}%")
            )
        else:
            stmt = stmt.where(StandaloneTraceRow.name.like(f"{filters.name_contains}%"))
    if filters.model is not None:
        if is_postgres:
            stmt = stmt.where(StandaloneTraceRow.models.contains([filters.model]))
        else:
            # JSON column on SQLite serializes ``["a","b"]``; the
            # quoted-substring match engages the underlying TEXT
            # storage without needing dialect-specific JSON ops.
            stmt = stmt.where(
                cast(StandaloneTraceRow.models, String).like(f'%"{filters.model}"%')
            )
    return stmt


@router.get("", response_model=StandaloneTraceListResponse)
async def list_traces(
    session: SessionDep,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    model: str | None = None,
    status: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    name_contains: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
) -> StandaloneTraceListResponse:
    """List traces sorted by ``started_at DESC`` with cursor pagination.

    Filters compose AND-style. ``cursor`` is opaque (base64url JSON);
    callers should treat it as a token to round-trip back. The list
    fetches ``limit + 1`` rows so it can detect whether a next page
    exists without a separate ``COUNT`` query.
    """
    filters = StandaloneTraceListFilters(
        started_after=started_after,
        started_before=started_before,
        model=model,
        status=status,
        user_id=user_id,
        session_id=session_id,
        name_contains=name_contains,
        limit=limit,
        cursor=cursor,
    )

    is_pg = _is_postgres(session)
    stmt = select(StandaloneTraceRow)
    stmt = _apply_filters(stmt, filters, is_postgres=is_pg)

    if filters.cursor is not None:
        started_at_cursor, trace_id_cursor = _decode_cursor(filters.cursor)
        # Stable tie-break on (started_at DESC, otel_trace_id ASC):
        # the next page starts at rows strictly older than the cursor's
        # ``started_at``, OR at the same ``started_at`` with a strictly
        # greater ``otel_trace_id``.
        stmt = stmt.where(
            (StandaloneTraceRow.started_at < started_at_cursor)
            | (
                (StandaloneTraceRow.started_at == started_at_cursor)
                & (StandaloneTraceRow.otel_trace_id > trace_id_cursor)
            )
        )

    stmt = stmt.order_by(
        StandaloneTraceRow.started_at.desc(),
        StandaloneTraceRow.otel_trace_id.asc(),
    ).limit(filters.limit + 1)

    result = await session.execute(stmt)
    rows = list(result.scalars().all())

    next_cursor: str | None = None
    if len(rows) > filters.limit:
        last = rows[filters.limit - 1]
        next_cursor = _encode_cursor(last.started_at, last.otel_trace_id)
        rows = rows[: filters.limit]

    items = [_row_to_list_item(r) for r in rows]
    return StandaloneTraceListResponse(
        items=items,
        next_cursor=next_cursor,
        total_estimate=None,
    )


@router.get("/_health", response_model=StandaloneTraceHealth)
async def trace_pipeline_health(request: Request) -> StandaloneTraceHealth:
    """Return queue depth + drop count from the running exporter.

    Safe-default: when no exporter is attached to ``app.state`` (engine
    booted without a trace pipeline, or T7 wiring not present), return
    zeroes plus ``writer_running=False`` so the UI panel stays
    renderable instead of erroring.

    Declared **before** the ``/{otel_trace_id}`` route so the literal
    path takes precedence over the path-parameter route at match time
    — FastAPI iterates in declaration order.
    """
    exporter = getattr(request.app.state, "trace_exporter", None)
    writer = getattr(request.app.state, "trace_writer", None)
    if exporter is None:
        return StandaloneTraceHealth(
            queue_depth=0,
            max_queue_size=0,
            overflow_count=0,
            writer_running=False,
        )

    return StandaloneTraceHealth(
        queue_depth=getattr(exporter, "queue_depth", 0),
        max_queue_size=getattr(exporter, "max_queue_size", 0),
        overflow_count=getattr(exporter, "overflow_count", 0),
        writer_running=bool(writer is not None and getattr(writer, "running", False)),
    )


def _decode_trace_id_path(otel_trace_id: str) -> bytes:
    """Decode the hex path parameter to a 16-byte trace id.

    Surfaces a ``404`` (not 422) on invalid hex so the route shape
    mirrors "no such trace" — clients can't probe for the existence of
    arbitrary keys via the error code.
    """
    try:
        decoded = bytes.fromhex(otel_trace_id)
    except ValueError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No trace found for the given id.",
            ),
        ) from exc
    if len(decoded) != 16:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No trace found for the given id.",
            ),
        )
    return decoded


def _row_mapping_to_span_read(mapping: Any) -> StandaloneSpanRead:
    """Translate a ``Result.mappings()`` row into the wire model."""
    return StandaloneSpanRead(
        otel_span_id=bytes(mapping["otel_span_id"]).hex(),
        otel_trace_id=bytes(mapping["otel_trace_id"]).hex(),
        parent_span_id=(
            bytes(mapping["parent_span_id"]).hex()
            if mapping["parent_span_id"] is not None
            else None
        ),
        name=mapping["name"],
        kind=mapping["kind"],
        started_at=mapping["started_at"],
        ended_at=mapping["ended_at"],
        latency_ms=(
            float(mapping["latency_ms"])
            if mapping["latency_ms"] is not None
            else None
        ),
        model=mapping["model"],
        provider=mapping["provider"],
        prompt_tokens=mapping["prompt_tokens"],
        completion_tokens=mapping["completion_tokens"],
        cache_read_tokens=mapping["cache_read_tokens"],
        cache_write_tokens=mapping["cache_write_tokens"],
        total_tokens=mapping["total_tokens"],
        cost_usd=(
            float(mapping["cost_usd"]) if mapping["cost_usd"] is not None else None
        ),
        cost_breakdown=mapping["cost_breakdown"],
        cost_source=mapping["cost_source"],
        status=mapping["status"],
        attributes=mapping["attributes"],
        events=mapping["events"],
    )


def _build_tree(
    spans: list[StandaloneSpanRead],
) -> list[StandaloneSpanTreeNode]:
    """Assemble a flat span list into a forest of trees.

    Spans whose ``parent_span_id`` is missing from the input set are
    surfaced as roots (orphans) so the UI never silently hides them —
    e.g. when the parent fell outside the depth-32 window or when the
    upstream agent emitted a span pointing to a parent in a different
    trace.
    """
    by_id: dict[str, StandaloneSpanTreeNode] = {
        s.otel_span_id: StandaloneSpanTreeNode(span=s, children=[])
        for s in spans
    }
    roots: list[StandaloneSpanTreeNode] = []
    for span in spans:
        node = by_id[span.otel_span_id]
        parent_key = span.parent_span_id
        if parent_key is None or parent_key not in by_id:
            roots.append(node)
            continue
        by_id[parent_key].children.append(node)
    return roots


_SPAN_TREE_CTE = text(
    """
    WITH RECURSIVE span_tree AS (
        SELECT
            started_at, otel_span_id, otel_trace_id, parent_span_id,
            name, kind, ended_at, latency_ms, model, provider,
            prompt_tokens, completion_tokens, cache_read_tokens,
            cache_write_tokens, total_tokens, cost_usd, cost_breakdown,
            cost_source, status, attributes, events,
            0 AS depth
        FROM standalone_span
        WHERE otel_trace_id = :trace_id_8
        AND (
            parent_span_id IS NULL
            OR parent_span_id NOT IN (
                SELECT otel_span_id FROM standalone_span
                WHERE otel_trace_id = :trace_id_8
            )
        )
        UNION ALL
        SELECT
            s.started_at, s.otel_span_id, s.otel_trace_id, s.parent_span_id,
            s.name, s.kind, s.ended_at, s.latency_ms, s.model, s.provider,
            s.prompt_tokens, s.completion_tokens, s.cache_read_tokens,
            s.cache_write_tokens, s.total_tokens, s.cost_usd, s.cost_breakdown,
            s.cost_source, s.status, s.attributes, s.events,
            t.depth + 1
        FROM standalone_span s
        JOIN span_tree t ON s.parent_span_id = t.otel_span_id
        WHERE s.otel_trace_id = :trace_id_8 AND t.depth < :max_depth
    )
    SELECT * FROM span_tree
    ORDER BY started_at, otel_span_id
    """
)


@router.get("/{otel_trace_id}", response_model=StandaloneTraceDetail)
async def get_trace_detail(
    otel_trace_id: str,
    session: SessionDep,
) -> StandaloneTraceDetail:
    """Return the trace + its span tree.

    Trace lookup uses the full 16-byte W3C id stored on
    ``standalone_trace``. The span query uses the trailing 8-byte slice
    (``trace_id[8:]``) — that's the form the exporter persists onto
    ``standalone_span.otel_trace_id``.
    """
    trace_id_16 = _decode_trace_id_path(otel_trace_id)
    trace_id_8 = trace_id_16[8:]

    trace_row = (
        await session.execute(
            select(StandaloneTraceRow).where(
                StandaloneTraceRow.otel_trace_id == trace_id_16
            )
        )
    ).scalar_one_or_none()
    if trace_row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No trace found for the given id.",
            ),
        )

    # Recursion cap: seed counts as one level, every UNION ALL pass
    # adds one more, so ``t.depth < N - 1`` yields exactly N levels
    # in the result set. Decision §28 asks for 32 total levels.
    result = await session.execute(
        _SPAN_TREE_CTE,
        {"trace_id_8": trace_id_8, "max_depth": _MAX_DEPTH_LEVELS - 1},
    )
    spans = [_row_mapping_to_span_read(m) for m in result.mappings().all()]

    return StandaloneTraceDetail(
        trace=_row_to_list_item(trace_row),
        tree=_build_tree(spans),
    )


@router.delete("/{otel_trace_id}", response_model=StandaloneTraceDeleteResult)
async def delete_trace(
    otel_trace_id: str,
    session: SessionDep,
) -> StandaloneTraceDeleteResult:
    """Delete a single trace and cascade to its spans.

    The trace row's PK is composite ``(started_at, otel_trace_id)`` so
    we look it up first to grab ``started_at``, then delete by full PK.
    Spans match on the 8-byte trace id slice. The 404 path leaves both
    tables untouched.
    """
    trace_id_16 = _decode_trace_id_path(otel_trace_id)
    trace_id_8 = trace_id_16[8:]

    trace_row = (
        await session.execute(
            select(StandaloneTraceRow).where(
                StandaloneTraceRow.otel_trace_id == trace_id_16
            )
        )
    ).scalar_one_or_none()
    if trace_row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No trace found for the given id.",
            ),
        )

    span_result = await session.execute(
        delete(StandaloneSpanRow).where(
            StandaloneSpanRow.otel_trace_id == trace_id_8
        )
    )
    deleted_spans = span_result.rowcount or 0

    await session.execute(
        delete(StandaloneTraceRow).where(
            StandaloneTraceRow.otel_trace_id == trace_id_16
        )
    )
    await session.commit()

    logger.info(
        "admin.traces.delete trace_id=%s spans=%d",
        trace_id_16.hex(),
        deleted_spans,
    )
    return StandaloneTraceDeleteResult(deleted_spans=deleted_spans)


@router.delete("", response_model=StandaloneTraceBulkDeleteResult)
async def bulk_delete_traces(
    session: SessionDep,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    model: str | None = None,
    status: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    name_contains: str | None = None,
) -> StandaloneTraceBulkDeleteResult:
    """Bulk-delete traces matching the same filters as ``GET ``.

    Strategy: select the matching trace ids first, then DELETE both
    tables by id. Two queries instead of a join keeps the SQL portable
    across PG and SQLite and avoids ``DELETE ... USING`` syntax that
    SQLite does not support.
    """
    filters = StandaloneTraceListFilters(
        started_after=started_after,
        started_before=started_before,
        model=model,
        status=status,
        user_id=user_id,
        session_id=session_id,
        name_contains=name_contains,
    )

    is_pg = _is_postgres(session)
    select_ids = select(
        StandaloneTraceRow.started_at, StandaloneTraceRow.otel_trace_id
    )
    select_ids = _apply_filters(select_ids, filters, is_postgres=is_pg)
    rows = (await session.execute(select_ids)).all()
    if not rows:
        return StandaloneTraceBulkDeleteResult(deleted_traces=0, deleted_spans=0)

    trace_ids_16 = [row.otel_trace_id for row in rows]
    trace_ids_8 = [tid[8:] for tid in trace_ids_16]

    span_result = await session.execute(
        delete(StandaloneSpanRow).where(
            StandaloneSpanRow.otel_trace_id.in_(trace_ids_8)
        )
    )
    deleted_spans = span_result.rowcount or 0

    trace_result = await session.execute(
        delete(StandaloneTraceRow).where(
            StandaloneTraceRow.otel_trace_id.in_(trace_ids_16)
        )
    )
    deleted_traces = trace_result.rowcount or 0
    await session.commit()

    logger.info(
        "admin.traces.bulk_delete traces=%d spans=%d",
        deleted_traces,
        deleted_spans,
    )
    return StandaloneTraceBulkDeleteResult(
        deleted_traces=deleted_traces,
        deleted_spans=deleted_spans,
    )
