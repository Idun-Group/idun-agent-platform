"""FastAPI dependencies for dependency injection."""

import os
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session

# ---------------------------------------------------------------------------
# Database session dependency
# ---------------------------------------------------------------------------

async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session."""
    async for session in get_async_session():
        yield session


# ---------------------------------------------------------------------------
# Settings dependency
# ---------------------------------------------------------------------------

def get_settings() -> Settings:
    """Get application settings."""
    return get_settings_dependency()


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

@dataclass
class CurrentUser:
    """Represents the authenticated user extracted from the session cookie."""
    user_id: str
    email: str
    roles: list[str] = field(default_factory=list)
    workspace_ids: list[str] = field(default_factory=list)


def get_current_user(request: Request) -> CurrentUser:
    """Read and verify the session cookie, returning a CurrentUser.

    Raises HTTPException 401 if the cookie is missing, expired, or invalid.
    """
    from app.api.v1.routers.auth import _read_session_cookie

    payload = _read_session_cookie(request)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    principal: dict[str, Any] = payload.get("principal", {})
    if not principal.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    return CurrentUser(
        user_id=principal["user_id"],
        email=principal.get("email", ""),
        roles=principal.get("roles", []),
        workspace_ids=principal.get("workspace_ids", []),
    )


def require_workspace(
    user: CurrentUser = Depends(get_current_user),
    x_workspace_id: str | None = Header(None),
) -> UUID:
    """Extract and validate the active workspace ID.

    Resolution order:
    1. ``X-Workspace-Id`` header (explicit workspace switch)
    2. First workspace from the user's session

    Raises HTTPException 400 if no workspace can be determined.
    """
    wid: str | None = x_workspace_id

    if not wid and user.workspace_ids:
        wid = user.workspace_ids[0]

    if not wid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active workspace. Create or join a workspace first.",
        )

    try:
        workspace_uuid = UUID(wid)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace ID format",
        ) from err

    if wid not in user.workspace_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this workspace",
        )

    return workspace_uuid


# ---------------------------------------------------------------------------
# Legacy API-key dependency (kept for backward compatibility)
# ---------------------------------------------------------------------------

async def allow_user(client_key: str = Query(...)) -> None:
    key = os.getenv("KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not secrets.compare_digest(key, client_key):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized. Make sure you have the correct Key.",
        )
