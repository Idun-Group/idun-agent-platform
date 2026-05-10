"""Asyncio writer task that drains the StandaloneSpanExporter queue.

The exporter runs in OTel's BatchSpanProcessor worker thread and pushes
parsed row dicts onto a thread-safe queue (drop-oldest backpressure).
This writer lives on the FastAPI event loop, drains the queue every
``schedule_delay_millis`` milliseconds (or whenever the writer's stop
event flips), and bulk-inserts the rows via ``session.execute(insert)``.

The writer is also responsible for finalising ``standalone_trace`` rows.
For every drained batch it groups the spans by full 16-byte trace_id
and, **only when the batch contains a root span** (``parent_span_id IS
None``), it emits one aggregate trace row per trace. Late spans of a
trace whose root has already finalised do NOT retroactively update the
trace row. This is an intentional v1 trade-off because:

  * the BatchSpanProcessor's default ``schedule_delay_millis=2000``
    keeps most traces inside one batch;
  * trace-row aggregates are documented as approximate (design KB §2 —
    "Tables");
  * the trace detail view recomputes aggregates from spans on read,
    so the source of truth for analytics stays span-derived.

We use ``ON CONFLICT DO NOTHING`` (PG) / ``INSERT OR IGNORE`` (SQLite)
so a duplicate root-span flush does not raise — the first finalise wins,
later attempts are no-ops.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/08-otel-pipeline-integration.md``
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/13-sizing-perf.md``
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/18-postgres-throughput-probe.md``

Fail-open: a failed batch insert is logged via ``logger.exception`` and
the writer keeps draining. The agent route must never block on a trace
write — losing a batch of spans is preferable to surfacing a DB error
through the chat path.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow

from ._finalizer import build_trace_rows
from .exporter import StandaloneSpanExporter

logger = logging.getLogger(__name__)


# Keys that the exporter stamps on row dicts for cross-pass carrying
# but are not StandaloneSpanRow columns. Stripped before insert.
_INTERNAL_KEYS = ("_full_trace_id",)


class TraceWriter:
    """Background task that drains the SpanExporter queue into the DB.

    Owns a single ``asyncio.Task``. ``start()`` schedules it on the
    current loop; ``stop()`` flips an ``asyncio.Event`` and waits up to
    5 s for the task to finish before cancelling.
    """

    def __init__(
        self,
        *,
        exporter: StandaloneSpanExporter,
        session_factory: async_sessionmaker[Any],
        max_export_batch_size: int = 512,
        schedule_delay_millis: int = 2000,
    ) -> None:
        self._exporter = exporter
        self._session_factory = session_factory
        self._max_batch = max_export_batch_size
        self._schedule_delay = schedule_delay_millis / 1000.0
        self._stop_event: asyncio.Event | None = None
        self._task: asyncio.Task[None] | None = None

    @property
    def running(self) -> bool:
        """Whether the drain task is alive on the current event loop."""
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        """Schedule the drain loop on the current event loop."""
        if self._task is not None:
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="idun-trace-writer")

    async def stop(self) -> None:
        """Signal stop, wait up to 5 s, then cancel."""
        if self._task is None:
            return
        if self._stop_event is not None:
            self._stop_event.set()
        try:
            await asyncio.wait_for(self._task, timeout=5.0)
        except TimeoutError:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None
            self._stop_event = None

    async def _run(self) -> None:
        """Drain loop: every ``schedule_delay``s or until stop."""
        assert self._stop_event is not None
        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._schedule_delay
                )
            except TimeoutError:
                pass
            await self._drain_once()
        # Final flush so spans queued just before shutdown are not lost.
        await self._drain_once()

    async def _drain_once(self) -> None:
        """Pull up to ``max_batch`` rows and insert them.

        Fail-open: any exception from the insert is logged and swallowed.
        Both passes (span insert + trace finalise) live in the same
        session/transaction so a partial trace row never lands without
        its spans.
        """
        batch: list[dict[str, Any]] = []
        n = self._exporter.drain_into(batch, self._max_batch)
        if n == 0:
            return

        # Trace rows are derived from the *raw* batch (we need
        # ``_full_trace_id`` to fill the 16-byte trace PK). Build them
        # before stripping internal keys for the span insert.
        trace_rows = build_trace_rows(batch)

        span_rows: list[dict[str, Any]] = []
        for raw in batch:
            row = {k: v for k, v in raw.items() if k not in _INTERNAL_KEYS}
            # SQLite has no GENERATED ALWAYS AS — the migration declares
            # it on PG but the writer must stamp it explicitly to keep
            # parity. The exporter computes total_tokens already, so this
            # is a defensive default for older row shapes.
            if row.get("total_tokens") is None:
                pt = row.get("prompt_tokens")
                ct = row.get("completion_tokens")
                if pt is not None or ct is not None:
                    row["total_tokens"] = (pt or 0) + (ct or 0)
            span_rows.append(row)

        try:
            async with self._session_factory() as session:
                await session.execute(insert(StandaloneSpanRow), span_rows)
                if trace_rows:
                    await self._upsert_traces(session, trace_rows)
                await session.commit()
        except Exception:
            logger.exception(
                "trace writer batch insert failed "
                "(spans=%d, traces=%d) — dropping batch",
                len(span_rows),
                len(trace_rows),
            )

    async def _upsert_traces(
        self, session: Any, trace_rows: list[dict[str, Any]]
    ) -> None:
        """Insert trace rows with dialect-specific ``DO NOTHING`` on conflict.

        See module docstring — first finalise wins, later attempts are
        no-ops, which trades full-history aggregation for write-path
        simplicity. Acceptable per design KB § Tables.
        """
        dialect = session.get_bind().dialect.name
        if dialect == "postgresql":
            stmt = pg_insert(StandaloneTraceRow).values(trace_rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["started_at", "otel_trace_id"]
            )
            await session.execute(stmt)
        else:
            stmt = sqlite_insert(StandaloneTraceRow).values(trace_rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["started_at", "otel_trace_id"]
            )
            await session.execute(stmt)
