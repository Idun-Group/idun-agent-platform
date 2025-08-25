"""Health check endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.core.settings import get_settings

router = APIRouter()


@router.get("/healthz")
async def health_check() -> dict[str, str]:
    """Basic health check."""
    return {"status": "healthy"}


@router.get("/readyz")
async def readiness_check(
    session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    """Readiness check including database connectivity."""
    try:
        # Test database connection
        await session.execute("SELECT 1")
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not ready", "error": str(e)}


@router.get("/version")
async def version() -> dict[str, str]:
    """Get application version."""
    settings = get_settings()
    return {
        "version": settings.api.version,
        "name": settings.api.title,
    } 