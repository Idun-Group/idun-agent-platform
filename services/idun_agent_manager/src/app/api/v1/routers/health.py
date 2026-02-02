"""Health check endpoints."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session

router = APIRouter()


@router.get("/healthz")
async def health_check() -> dict[str, str]:
    """Basic health check."""
    return {"status": "healthy"}


@router.get("/readyz")
async def readiness_check(
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Readiness check including database connectivity."""
    try:
        # Test database connection
        await session.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not ready", "error": str(e)}


@router.get("/version")
async def version(request: Request) -> dict[str, str]:
    """Get application version and name from FastAPI app metadata."""
    app = request.app
    return {
        "version": getattr(app, "version", "unknown"),
        "name": getattr(app, "title", "Idun Agent Manager API"),
    }
