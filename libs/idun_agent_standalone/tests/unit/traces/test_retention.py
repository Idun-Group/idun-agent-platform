"""Unit tests for the retention scheduler.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/README.md`` § Retention
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
from idun_agent_standalone.infrastructure.traces import retention as retention_module
from idun_agent_standalone.infrastructure.traces.retention import RetentionScheduler


@pytest.mark.asyncio
async def test_scheduler_starts_and_stops_clean():
    sm = MagicMock()
    scheduler = RetentionScheduler(session_factory=sm, retention_days=14)
    await scheduler.start()
    await scheduler.stop()


@pytest.mark.asyncio
async def test_sqlite_branch_deletes_old_rows():
    """Verify the SQLite predicate fires DELETE on span then trace."""
    sm = MagicMock()
    session_ctx = MagicMock()
    session = AsyncMock()
    session_ctx.__aenter__ = AsyncMock(return_value=session)
    session_ctx.__aexit__ = AsyncMock(return_value=False)
    sm.return_value = session_ctx

    bind = MagicMock()
    bind.dialect.name = "sqlite"
    session.get_bind = MagicMock(return_value=bind)
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    scheduler = RetentionScheduler(session_factory=sm, retention_days=14)
    await scheduler._run_once()

    assert session.execute.await_count == 2
    calls = [str(c.args[0]).lower() for c in session.execute.await_args_list]
    # span DELETE must come first to honour the (started_at, otel_span_id)
    # PK order — the trace row is dropped only after children are gone.
    assert "standalone_span" in calls[0]
    assert "delete" in calls[0]
    assert "standalone_trace" in calls[1]
    assert "delete" in calls[1]
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_run_once_failopen_on_exception(caplog):
    """A failure in _run_once must not propagate."""
    sm = MagicMock(side_effect=RuntimeError("boom"))
    scheduler = RetentionScheduler(session_factory=sm, retention_days=14)
    # Alembic's ``fileConfig()`` (run by upstream integration tests) sets
    # ``disable_existing_loggers=True`` by default, which silently turns
    # ``disabled=True`` on every already-imported module logger. caplog
    # cannot capture from a disabled logger regardless of level or
    # propagation, so we re-enable the specific logger the source module
    # uses before exercising it.
    retention_module.logger.disabled = False
    retention_module.logger.propagate = True
    with caplog.at_level(logging.ERROR, logger=retention_module.logger.name):
        await scheduler._run_once()  # must not raise
    assert any(
        "retention" in r.message.lower() or "boom" in r.message.lower()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_pg_branch_advisory_lock_skip_when_busy():
    """When pg_try_advisory_lock returns False, _run_once exits cleanly."""
    sm = MagicMock()
    session_ctx = MagicMock()
    session = AsyncMock()
    session_ctx.__aenter__ = AsyncMock(return_value=session)
    session_ctx.__aexit__ = AsyncMock(return_value=False)
    sm.return_value = session_ctx

    bind = MagicMock()
    bind.dialect.name = "postgresql"
    session.get_bind = MagicMock(return_value=bind)

    # First execute = pg_try_advisory_lock → returns False (held elsewhere).
    lock_result = MagicMock()
    lock_result.scalar = MagicMock(return_value=False)
    session.execute = AsyncMock(return_value=lock_result)
    session.commit = AsyncMock()

    scheduler = RetentionScheduler(session_factory=sm, retention_days=14)
    await scheduler._run_once()

    # Only the advisory-lock probe ran; no DROP TABLE / DETACH issued.
    assert session.execute.await_count == 1
    call_sql = str(session.execute.await_args_list[0].args[0]).lower()
    assert "pg_try_advisory_lock" in call_sql


def test_retention_days_default():
    """Default retention is 14 days when no override is supplied.

    ENV-001: ``IDUN_TRACE_RETENTION_DAYS`` is now read by
    ``StandaloneSettings`` and threaded into the scheduler by the
    bootstrap callback. The scheduler itself only takes a kwarg.
    """
    sm = MagicMock()
    scheduler = RetentionScheduler(session_factory=sm)
    assert scheduler._retention_days == 14


def test_retention_days_kwarg_override():
    """Constructor kwarg overrides the default."""
    sm = MagicMock()
    scheduler = RetentionScheduler(session_factory=sm, retention_days=30)
    assert scheduler._retention_days == 30


def test_lock_key_is_stable_across_processes():
    """The advisory-lock key must NOT use Python's hash randomisation.

    Regression: when multi-worker uvicorn was deployed each worker
    computed a different ``_LOCK_KEY`` because ``hash()`` is seeded by
    ``PYTHONHASHSEED``. ``pg_try_advisory_lock`` would never collide
    and every worker would race on the partition rotation. The fix
    pins the key to a deterministic BLAKE2b digest of a fixed byte
    string. Asserting the precomputed value catches any accidental
    rotation back to ``hash()`` or a different seed string.
    """
    from idun_agent_standalone.infrastructure.traces.retention import _LOCK_KEY

    # BLAKE2b-32 of b"idun.traces.retention" masked to 31 bits.
    assert _LOCK_KEY == 1252085694
