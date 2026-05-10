"""Asyncio writer task that drains the StandaloneSpanExporter queue.

The exporter runs in OTel's BatchSpanProcessor worker thread and pushes
parsed row dicts onto a thread-safe queue (drop-oldest backpressure).
This writer lives on the FastAPI event loop, drains the queue every
``schedule_delay_millis`` milliseconds (or whenever the writer's stop
event flips), and bulk-inserts the rows via ``session.execute(insert)``.

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
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.infrastructure.db.models.span import StandaloneSpanRow

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
        """
        batch: list[dict[str, Any]] = []
        n = self._exporter.drain_into(batch, self._max_batch)
        if n == 0:
            return

        rows: list[dict[str, Any]] = []
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
            rows.append(row)

        try:
            async with self._session_factory() as session:
                await session.execute(insert(StandaloneSpanRow), rows)
                await session.commit()
        except Exception:
            logger.exception(
                "trace writer batch insert failed (rows=%d) — dropping batch",
                len(rows),
            )
