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
    StandaloneTraceHealth,
    StandaloneTraceListFilters,
    StandaloneTraceListItem,
    StandaloneTraceListResponse,
)
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import SessionDep, require_auth
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow

router = APIRouter(
    prefix="/admin/api/v1/traces",
    tags=["Traces"],
    dependencies=[Depends(require_auth)],
)

logger = get_logger(__name__)


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
