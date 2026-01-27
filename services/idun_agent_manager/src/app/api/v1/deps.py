"""FastAPI dependencies for dependency injection."""

import os
import secrets
from collections.abc import AsyncIterator

from fastapi import HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

# from app.application.services.agent_service import AgentService
from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session


# Database session dependency
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session."""
    async for session in get_async_session():
        yield session


# Settings dependency
def get_settings() -> Settings:
    """Get application settings."""
    return get_settings_dependency()


async def allow_user(client_key: str = Query(...)) -> None:
    key = os.getenv("KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not secrets.compare_digest(key, client_key):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized. Make sure you have the correct Key.",
        )
