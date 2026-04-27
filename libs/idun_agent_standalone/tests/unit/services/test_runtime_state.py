"""Tests for the runtime_state service."""

from __future__ import annotations

import pytest
from idun_agent_schema.standalone import StandaloneReloadStatus
from idun_agent_standalone.services import runtime_state


@pytest.mark.asyncio
async def test_get_returns_none_on_empty(async_session) -> None:
    assert await runtime_state.get(async_session) is None


@pytest.mark.asyncio
async def test_record_then_get(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
        error=None,
        config_hash="abc123",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row is not None
    assert row.last_status == "reloaded"
    assert row.last_message == "Saved."
    assert row.last_applied_config_hash == "abc123"
    # SQLite drops tzinfo on DateTime columns, so compare naive components.
    assert row.last_reloaded_at.replace(tzinfo=None) == frozen_now().replace(
        tzinfo=None
    )


@pytest.mark.asyncio
async def test_record_overwrites(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="First.",
        error=None,
        config_hash="hash1",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Second.",
        error="boom",
        config_hash=None,
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row.last_status == "reload_failed"
    assert row.last_message == "Second."
    assert row.last_error == "boom"
    assert row.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_record_failure_preserves_distinct_fields(
    async_session, frozen_now
) -> None:
    """The failure path writes status, message, error; it nulls hash."""
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Engine reload failed.",
        error="ImportError: graph module not found",
        config_hash=None,
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    row = await runtime_state.get(async_session)
    assert row.last_error == "ImportError: graph module not found"
    assert row.last_applied_config_hash is None


@pytest.mark.asyncio
async def test_clear_removes_singleton(async_session, frozen_now) -> None:
    await runtime_state.record_reload_outcome(
        async_session,
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
        error=None,
        config_hash="abc",
        reloaded_at=frozen_now(),
    )
    await async_session.commit()
    await runtime_state.clear(async_session)
    await async_session.commit()
    assert await runtime_state.get(async_session) is None


@pytest.mark.asyncio
async def test_clear_on_empty_is_noop(async_session) -> None:
    await runtime_state.clear(async_session)
    await async_session.commit()
    assert await runtime_state.get(async_session) is None
