"""Unit tests for the trace-event retention purge.

The standalone schedules ``purge_once`` hourly via APScheduler. These
tests exercise the purge function directly against a real SQLite session
so we don't have to wait on the scheduler clock.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.db.models import SessionRow, TraceEventRow
from idun_agent_standalone.traces.retention import (
    purge_once,
    start_retention_scheduler,
    stop_retention_scheduler,
)
from sqlalchemy import select


async def _build_db(tmp_path):
    engine = create_db_engine(f"sqlite+aiosqlite:///{tmp_path / 'r.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, create_sessionmaker(engine)


@pytest.mark.asyncio
async def test_purge_drops_old_events_keeps_recent(tmp_path):
    engine, sm = await _build_db(tmp_path)
    now = datetime.now(UTC)
    old = now - timedelta(days=40)
    fresh = now - timedelta(days=1)

    async with sm() as s:
        s.add(SessionRow(id="old-thread", message_count=1))
        s.add(SessionRow(id="new-thread", message_count=1))
        s.add(
            TraceEventRow(
                session_id="old-thread",
                run_id="r-old",
                sequence=0,
                event_type="RunStarted",
                payload={},
                created_at=old,
            )
        )
        s.add(
            TraceEventRow(
                session_id="new-thread",
                run_id="r-new",
                sequence=0,
                event_type="RunStarted",
                payload={},
                created_at=fresh,
            )
        )
        await s.commit()

    events_deleted, sessions_deleted = await purge_once(sm, retention_days=30)
    assert events_deleted == 1
    assert sessions_deleted == 1  # old-thread no longer has events

    async with sm() as s:
        rows = (
            await s.execute(select(TraceEventRow))
        ).scalars().all()
        sessions = (await s.execute(select(SessionRow))).scalars().all()
    assert [r.session_id for r in rows] == ["new-thread"]
    assert [s.id for s in sessions] == ["new-thread"]
    await engine.dispose()


@pytest.mark.asyncio
async def test_purge_with_zero_or_negative_days_is_noop(tmp_path):
    """Disabling retention must NOT delete anything."""
    engine, sm = await _build_db(tmp_path)
    long_ago = datetime.now(UTC) - timedelta(days=365)
    async with sm() as s:
        s.add(SessionRow(id="t", message_count=1))
        s.add(
            TraceEventRow(
                session_id="t",
                run_id="r",
                sequence=0,
                event_type="X",
                payload={},
                created_at=long_ago,
            )
        )
        await s.commit()

    events, sessions = await purge_once(sm, retention_days=0)
    assert (events, sessions) == (0, 0)

    async with sm() as s:
        rows = (await s.execute(select(TraceEventRow))).scalars().all()
    assert len(rows) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_start_retention_scheduler_returns_none_when_disabled(tmp_path):
    _, sm = await _build_db(tmp_path)
    scheduler = start_retention_scheduler(sm, retention_days=0)
    assert scheduler is None
    # No-op shutdown should not raise.
    stop_retention_scheduler(scheduler)


@pytest.mark.asyncio
async def test_start_retention_scheduler_runs_and_stops(tmp_path):
    """The hourly scheduler should accept jobs and tear down cleanly."""
    import asyncio

    _, sm = await _build_db(tmp_path)
    scheduler = start_retention_scheduler(sm, retention_days=30)
    try:
        assert scheduler is not None
        assert scheduler.running
        # The job ids registered at startup are documented in retention.py;
        # surface them so a future rename is caught here.
        job_ids = {job.id for job in scheduler.get_jobs()}
        assert "trace-retention-hourly" in job_ids
        assert "trace-retention-startup" in job_ids
    finally:
        stop_retention_scheduler(scheduler)
    # AsyncIOScheduler's shutdown is processed by the event loop on the
    # next yield; surface that to the test so the assertion is honest.
    await asyncio.sleep(0)
    assert not scheduler.running
