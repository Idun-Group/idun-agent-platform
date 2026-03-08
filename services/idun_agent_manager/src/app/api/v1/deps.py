"""FastAPI dependencies for dependency injection."""

import os
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
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


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """Read and verify the session cookie, returning a CurrentUser.

    Checks `session_version` in the cookie against the database to ensure
    the session has not been invalidated by a role change.

    Raises HTTPException 401 if the cookie is missing, expired, invalid,
    or the session version is stale.
    """
    from app.api.v1.routers.auth import _read_session_cookie
    from app.infrastructure.db.models.user import UserModel

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

    # Check session_version against DB
    cookie_version: int = principal.get("session_version", 0)
    user_id = UUID(principal["user_id"])
    user_model = await session.get(UserModel, user_id)
    if user_model is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if cookie_version < user_model.session_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated",
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
# Project RBAC dependency
# ---------------------------------------------------------------------------


@dataclass
class ProjectAccess:
    """Result of project authorization check."""

    project_id: UUID
    workspace_id: UUID
    role: str  # "admin" | "contributor" | "reader"
    is_workspace_owner: bool


async def require_project_role(
    project_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
    min_role: str = "reader",
) -> ProjectAccess:
    """Verify user has at least *min_role* on the given project.

    Resolution:
    1. Check workspace membership exists.
    2. If workspace owner -> return admin-equivalent access.
    3. Else check project_memberships for explicit role.
    4. If no project membership -> 404 (project not found).
    5. If role < min_role -> 403 (insufficient permissions).
    """
    from app.api.v1.schemas.workspace_members import PROJECT_ROLE_HIERARCHY
    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.project import ProjectModel
    from app.infrastructure.db.models.project_membership import ProjectMembershipModel

    # Verify project exists and get its workspace
    project = await session.get(ProjectModel, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Verify workspace membership
    ws_stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == project.workspace_id,
    )
    membership = (await session.execute(ws_stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Workspace owners have explicit admin rows, but also flag them
    if membership.is_owner:
        # Owners should have explicit project membership rows,
        # but even if missing, grant full access
        return ProjectAccess(
            project_id=project_id,
            workspace_id=project.workspace_id,
            role="admin",
            is_workspace_owner=True,
        )

    # Check project membership
    pm_stmt = select(ProjectMembershipModel).where(
        ProjectMembershipModel.project_id == project_id,
        ProjectMembershipModel.user_id == UUID(user.user_id),
    )
    pm = (await session.execute(pm_stmt)).scalar_one_or_none()
    if pm is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Check role hierarchy
    user_level = PROJECT_ROLE_HIERARCHY.get(pm.role, 0)
    required_level = PROJECT_ROLE_HIERARCHY.get(min_role, 0)
    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {min_role} role on this project",
        )

    return ProjectAccess(
        project_id=project_id,
        workspace_id=project.workspace_id,
        role=pm.role,
        is_workspace_owner=False,
    )


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
