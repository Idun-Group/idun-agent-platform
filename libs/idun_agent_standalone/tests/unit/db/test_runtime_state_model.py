"""Tests for StandaloneRuntimeStateRow ORM."""

from __future__ import annotations

from datetime import datetime

import pytest
from idun_agent_standalone.infrastructure.db.models.runtime_state import (
    StandaloneRuntimeStateRow,
)


@pytest.mark.asyncio
async def test_runtime_state_default_pk_singleton(async_session) -> None:
    row = StandaloneRuntimeStateRow(id="singleton")
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.id == "singleton"


@pytest.mark.asyncio
async def test_runtime_state_server_default_updated_at(async_session) -> None:
    row = StandaloneRuntimeStateRow(id="singleton")
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.updated_at is not None
    assert isinstance(row.updated_at, datetime)


@pytest.mark.asyncio
async def test_runtime_state_columns_nullable(async_session) -> None:
    row = StandaloneRuntimeStateRow(
        id="singleton",
        last_status=None,
        last_message=None,
        last_error=None,
        last_applied_config_hash=None,
        last_reloaded_at=None,
    )
    async_session.add(row)
    await async_session.flush()
    await async_session.refresh(row)
    assert row.last_status is None
    assert row.last_applied_config_hash is None
