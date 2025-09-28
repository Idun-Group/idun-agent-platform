"""SQLAlchemy 2.0 async database session configuration."""

from collections.abc import AsyncIterator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.settings import get_settings


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""

    pass


# Global variables for engines and session makers
_async_engine = None
_async_session_maker = None
_sync_engine = None
_sync_session_maker = None


def get_async_engine():
    """Get async database engine (singleton)."""
    global _async_engine

    if _async_engine is None:
        settings = get_settings()

        _async_engine = create_async_engine(
            settings.database.url,
            echo=settings.database.echo,
            pool_size=settings.database.pool_size,
            max_overflow=settings.database.max_overflow,
            pool_pre_ping=settings.database.pool_pre_ping,
            future=True,
        )

    return _async_engine


def get_sync_engine():
    """Get synchronous database engine for migrations."""
    global _sync_engine

    if _sync_engine is None:
        settings = get_settings()

        # Convert async URL to sync URL for migrations
        sync_url = settings.database.url.replace("+asyncpg", "").replace("+asyncio", "")

        _sync_engine = create_engine(
            sync_url,
            echo=settings.database.echo,
            pool_size=settings.database.pool_size,
            max_overflow=settings.database.max_overflow,
            pool_pre_ping=settings.database.pool_pre_ping,
            future=True,
        )

    return _sync_engine


def get_async_session_maker() -> async_sessionmaker[AsyncSession]:
    """Get async session maker (singleton)."""
    global _async_session_maker

    if _async_session_maker is None:
        _async_session_maker = async_sessionmaker(
            bind=get_async_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )

    return _async_session_maker


def get_sync_session_maker() -> sessionmaker:
    """Get sync session maker for migrations."""
    global _sync_session_maker

    if _sync_session_maker is None:
        _sync_session_maker = sessionmaker(
            bind=get_sync_engine(),
            autoflush=False,
            autocommit=False,
        )

    return _sync_session_maker


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """Get async database session for dependency injection."""
    session_maker = get_async_session_maker()

    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_sync_session():
    """Get sync database session for migrations."""
    session_maker = get_sync_session_maker()

    with session_maker() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


async def create_tables():
    """Create all database tables."""
    engine = get_async_engine()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_tables():
    """Drop all database tables."""
    engine = get_async_engine()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def close_engines():
    """Close database engines."""
    global _async_engine, _sync_engine

    if _async_engine:
        await _async_engine.dispose()
        _async_engine = None

    if _sync_engine:
        _sync_engine.dispose()
        _sync_engine = None
