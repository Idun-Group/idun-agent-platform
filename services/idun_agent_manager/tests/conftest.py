"""Pytest fixtures."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.deps import get_session
from app.infrastructure.db.models.managed_agent import ManagedAgentModel  # noqa: F401
from app.infrastructure.db.models.managed_guardrail import (
    ManagedGuardrailModel,  # noqa: F401
)
from app.infrastructure.db.models.managed_mcp_server import (
    ManagedMCPServerModel,  # noqa: F401
)
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel  # noqa: F401
from app.infrastructure.db.models.managed_observability import (
    ManagedObservabilityModel,  # noqa: F401
)
from app.infrastructure.db.models.membership import MembershipModel  # noqa: F401
from app.infrastructure.db.models.user import UserModel  # noqa: F401
from app.infrastructure.db.models.workspace import WorkspaceModel  # noqa: F401
from app.infrastructure.db.session import Base

# Swap PostgreSQL-specific column types (JSONB, UUID) to SQLite-compatible equivalents
for _table in Base.metadata.tables.values():
    for _col in _table.columns:
        if isinstance(_col.type, JSONB):
            _col.type = JSON()
        elif isinstance(_col.type, PG_UUID):
            _col.type = Uuid()


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncIterator[AsyncSession]:
    """Create tables, yield a session, then drop tables."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    from app.main import create_app

    app = create_app()
    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
