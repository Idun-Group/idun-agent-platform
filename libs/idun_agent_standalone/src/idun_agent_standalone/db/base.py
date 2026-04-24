"""Async SQLAlchemy primitives: declarative base + engine/sessionmaker factories.

The standalone supports SQLite (default, single-file) and Postgres (Cloud Run
and multi-container deploys) via a single ``DATABASE_URL`` env var. Drivers
are selected by URL scheme: ``sqlite+aiosqlite://``, ``postgresql+asyncpg://``.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all standalone ORM models."""


def create_db_engine(url: str) -> AsyncEngine:
    """Create an async SQLAlchemy engine. ``pool_pre_ping`` survives idle
    connection drops, which matters on Cloud Run where Cloud SQL Auth Proxy
    can recycle connections under the hood.
    """
    return create_async_engine(url, pool_pre_ping=True, future=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
