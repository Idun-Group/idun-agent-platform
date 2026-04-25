"""APScheduler-driven trace retention purge.

Spec §3.5 commits to deleting ``trace_event`` rows older than
``IDUN_TRACES_RETENTION_DAYS`` on a long-running deploy. APScheduler is
listed in ``pyproject.toml`` as a runtime dep but nothing imported it
before this module existed — the promise was unkept and the table grew
unboundedly.

We schedule a single async job that runs once at startup (so a
long-stopped instance catches up) and then hourly. It uses an ON DELETE
CASCADE on ``TraceEventRow.session_id`` to drop trace rows; afterwards
we sweep ``SessionRow``s that no longer have any events. ``Engine``
shutdown is the operator's responsibility (we do not own it).

Operators can disable retention by setting
``IDUN_TRACES_RETENTION_DAYS=0`` (or any non-positive number); the
returned scheduler is then ``None``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.db.models import SessionRow, TraceEventRow

logger = logging.getLogger(__name__)


async def purge_once(
    sessionmaker: async_sessionmaker[Any], retention_days: int
) -> tuple[int, int]:
    """Delete trace events older than ``retention_days`` and orphaned sessions.

    Returns ``(events_deleted, sessions_deleted)``. Both counts are
    best-effort — SQLite's ``DELETE ... RETURNING`` is supported but the
    Postgres backend handles it identically, so we use ``rowcount``.
    """
    if retention_days <= 0:
        return (0, 0)
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    async with sessionmaker() as session:
        result = await session.execute(
            delete(TraceEventRow).where(TraceEventRow.created_at < cutoff)
        )
        events_deleted = result.rowcount or 0

        # Drop sessions that no longer have any events. We use a
        # subquery rather than the FK CASCADE because not every backend
        # honours the schema's ``ondelete="CASCADE"`` (SQLite needs
        # ``PRAGMA foreign_keys=ON``).
        live_session_ids = select(TraceEventRow.session_id).distinct()
        result_sessions = await session.execute(
            delete(SessionRow).where(SessionRow.id.notin_(live_session_ids))
        )
        sessions_deleted = result_sessions.rowcount or 0
        await session.commit()

    if events_deleted or sessions_deleted:
        logger.info(
            "trace retention purge: removed %d events, %d sessions "
            "(cutoff=%s, retention=%d days)",
            events_deleted,
            sessions_deleted,
            cutoff.isoformat(),
            retention_days,
        )
    return (events_deleted, sessions_deleted)


def start_retention_scheduler(
    sessionmaker: async_sessionmaker[Any], retention_days: int
) -> AsyncIOScheduler | None:
    """Schedule an hourly ``purge_once`` and run it once at startup.

    Returns ``None`` (and logs a warning) when retention is disabled
    via ``retention_days <= 0``.
    """
    if retention_days <= 0:
        logger.warning(
            "trace retention disabled (retention_days=%d) — trace_event "
            "table will grow without bound",
            retention_days,
        )
        return None

    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        try:
            await purge_once(sessionmaker, retention_days)
        except Exception:  # noqa: BLE001 — retention failures must never crash the loop
            logger.exception("trace retention job failed")

    # Hourly cadence + an initial run that fires ~5 seconds after start.
    scheduler.add_job(_job, "interval", hours=1, id="trace-retention-hourly")
    scheduler.add_job(
        _job,
        "date",
        run_date=datetime.now(UTC) + timedelta(seconds=5),
        id="trace-retention-startup",
    )
    scheduler.start()
    logger.info(
        "trace retention scheduler running (retention_days=%d, hourly)",
        retention_days,
    )
    return scheduler


def stop_retention_scheduler(
    scheduler: AsyncIOScheduler | None,
) -> None:
    """Shut the scheduler down without waiting on running jobs."""
    if scheduler is None:
        return
    try:
        scheduler.shutdown(wait=False)
    except Exception:  # noqa: BLE001
        logger.exception("retention scheduler shutdown failed")
