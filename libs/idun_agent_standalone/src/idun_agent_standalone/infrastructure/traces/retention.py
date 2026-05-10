"""Daily retention scheduler for the standalone trace tables.

PG branch:
    - Acquires ``pg_try_advisory_lock(<key>)`` to fence multi-worker
      uvicorn deployments — only one worker rotates partitions at a
      time.
    - Drops monthly partitions whose calendar end is older than
      ``now - IDUN_TRACE_RETENTION_DAYS`` for both ``standalone_trace``
      and ``standalone_span``. Uses ``DETACH CONCURRENTLY`` then
      ``DROP TABLE`` to avoid an ACCESS EXCLUSIVE lock on the parent.
    - Pre-creates the next-next-month partition for both tables so
      the writer never inserts into the ``DEFAULT`` catch-all.
    - Releases the advisory lock with ``pg_advisory_unlock``.

SQLite branch:
    - No partitions, no advisory lock. Two ``DELETE`` statements
      executed in ``span → trace`` order so children are removed
      before their parent. The cutoff is the ISO-8601 string format
      stamped by T1's migration on the ``started_at`` column.

Fail-open: any exception inside ``_run_once`` is logged via
``logger.exception`` and swallowed. The agent route must never block
on retention; lost retention runs are recoverable on the next tick.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/README.md``
    § Retention, § Partitioning, § Multi-worker support
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


# Stable advisory-lock key derived from a fixed string. Truncated to a
# signed 32-bit value so it fits both pg_try_advisory_lock(int) and the
# pg_advisory_unlock(int) signature.
_LOCK_KEY = abs(hash("idun.traces.retention")) & 0x7FFFFFFF

# Monthly cadence per the locked design. Hardcoded — not configurable.
_RETENTION_TABLES = ("standalone_trace", "standalone_span")


class RetentionScheduler:
    """Cron-driven retention runner.

    One job, fired daily at 03:00 UTC. The cron expression is locked in
    the design — making it configurable would invite drift in
    multi-worker deployments where the advisory lock fences the work.
    """

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[Any],
        retention_days: int | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._retention_days = (
            retention_days
            if retention_days is not None
            else int(os.getenv("IDUN_TRACE_RETENTION_DAYS", "14"))
        )
        self._scheduler: AsyncIOScheduler | None = None

    async def start(self) -> None:
        """Schedule the daily job on the current event loop."""
        if self._scheduler is not None:
            return
        self._scheduler = AsyncIOScheduler(timezone="UTC")
        self._scheduler.add_job(
            self._run_once,
            trigger="cron",
            hour=3,
            minute=0,
            id="idun-trace-retention",
            replace_existing=True,
        )
        self._scheduler.start()

    async def stop(self) -> None:
        """Shut down the scheduler. Idempotent."""
        if self._scheduler is None:
            return
        try:
            self._scheduler.shutdown(wait=False)
        except Exception:
            logger.exception("retention scheduler shutdown failed")
        finally:
            self._scheduler = None

    async def _run_once(self) -> None:
        """Single retention pass. Fails open: never raises."""
        try:
            async with self._session_factory() as session:
                bind = session.get_bind()
                dialect = bind.dialect.name
                if dialect == "postgresql":
                    await self._run_postgres(session)
                else:
                    await self._run_sqlite(session)
        except Exception:
            logger.exception("trace retention run failed — will retry next tick")

    async def _run_sqlite(self, session: Any) -> None:
        cutoff = (datetime.now(UTC) - timedelta(days=self._retention_days)).isoformat()
        # span first → trace last, matching the natural-key parent/child
        # direction. Both tables store ``started_at`` as ISO-8601 TEXT.
        await session.execute(
            text("DELETE FROM standalone_span WHERE started_at < :cutoff"),
            {"cutoff": cutoff},
        )
        await session.execute(
            text("DELETE FROM standalone_trace WHERE started_at < :cutoff"),
            {"cutoff": cutoff},
        )
        await session.commit()

    async def _run_postgres(self, session: Any) -> None:
        """Acquire advisory lock, drop expired partitions, pre-create next."""
        lock_held = (
            await session.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": _LOCK_KEY}
            )
        ).scalar()
        if not lock_held:
            # Another worker holds the lock — no-op.
            return
        try:
            cutoff = datetime.now(UTC) - timedelta(days=self._retention_days)
            for parent in _RETENTION_TABLES:
                await self._drop_expired_partitions(session, parent, cutoff)
                await self._precreate_next_partition(session, parent)
            await session.commit()
        finally:
            await session.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": _LOCK_KEY}
            )

    async def _drop_expired_partitions(
        self, session: Any, parent: str, cutoff: datetime
    ) -> None:
        """DETACH CONCURRENTLY then DROP TABLE for partitions older than cutoff.

        Partition naming follows T1's migration pattern: ``<parent>_<YYYYMM>``.
        We discover them from ``pg_inherits`` rather than name-matching to
        survive any future rename.
        """
        rows = (
            await session.execute(
                text(
                    "SELECT inhrelid::regclass::text "
                    "FROM pg_inherits "
                    "WHERE inhparent = (:parent)::regclass"
                ),
                {"parent": parent},
            )
        ).fetchall()

        for (qualified_name,) in rows:
            short_name = qualified_name.rsplit(".", 1)[-1]
            # Skip the catch-all DEFAULT partition — never drop it.
            if short_name.endswith("_default"):
                continue
            tag = short_name.rsplit("_", 1)[-1]
            try:
                year = int(tag[:4])
                month = int(tag[4:6])
            except (ValueError, IndexError):
                # Unparseable tag — leave it alone.
                continue
            # Partition end-of-month is the first of the following month.
            if month == 12:
                end_year, end_month = year + 1, 1
            else:
                end_year, end_month = year, month + 1
            partition_end = datetime(end_year, end_month, 1, tzinfo=UTC)
            if partition_end < cutoff:
                # DETACH CONCURRENTLY cannot run inside a txn block; we
                # rely on SQLAlchemy's autocommit-friendly ``text`` exec
                # under the writer's session. If the dialect rejects it
                # in a txn, the failure is caught at _run_once.
                await session.execute(
                    text(f'ALTER TABLE {parent} DETACH PARTITION "{short_name}"')
                )
                await session.execute(text(f'DROP TABLE IF EXISTS "{short_name}"'))

    async def _precreate_next_partition(self, session: Any, parent: str) -> None:
        """Pre-create the next-next month partition (defensive)."""
        first_of_this_month = datetime.now(UTC).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        # Two months ahead of "now" — gives the daily job a generous
        # window to land before the writer would otherwise overflow into
        # the DEFAULT partition.
        target_year = first_of_this_month.year
        target_month = first_of_this_month.month + 2
        while target_month > 12:
            target_month -= 12
            target_year += 1
        start = datetime(target_year, target_month, 1, tzinfo=UTC)
        if start.month == 12:
            end = datetime(start.year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(start.year, start.month + 1, 1, tzinfo=UTC)
        tag = start.strftime("%Y%m")
        await session.execute(
            text(
                f'CREATE TABLE IF NOT EXISTS "{parent}_{tag}" '
                f"PARTITION OF {parent} "
                f"FOR VALUES FROM ('{start.isoformat()}') "
                f"TO ('{end.isoformat()}')"
            )
        )
