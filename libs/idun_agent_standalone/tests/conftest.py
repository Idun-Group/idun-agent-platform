"""Shared pytest fixtures for the standalone test suite.

Phase 3 introduces async DB session and stub reload fixtures used by
unit + integration tests. Existing legacy tests are unaffected.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from idun_agent_standalone.infrastructure.db import (
    models,  # noqa: F401  registers ORMs on Base
)
from idun_agent_standalone.infrastructure.db.session import Base
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


@pytest.fixture
async def async_session() -> AsyncIterator[AsyncSession]:
    """An in-memory SQLite async session with all standalone ORMs created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def stub_reload_callable() -> AsyncMock:
    """An AsyncMock for the engine reload callable; configurable per test."""
    return AsyncMock(return_value=None)


@pytest.fixture
def frozen_now() -> Callable[[], datetime]:
    """Fixed datetime so reload outcome timestamps are deterministic in tests."""
    fixed = datetime(2026, 4, 27, 12, 0, 0, tzinfo=UTC)
    return lambda: fixed
