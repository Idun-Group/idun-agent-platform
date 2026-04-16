"""FastAPI dependencies for dependency injection."""

import os
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, Request, status
from idun_agent_schema.manager.project import ProjectRole
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session


async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session."""
    async for session in get_async_session():
        yield session


def get_settings() -> Settings:
    """Get application settings."""
    return get_settings_dependency()


PROJECT_ROLE_HIERARCHY: dict[ProjectRole, int] = {
    ProjectRole.ADMIN: 3,
    ProjectRole.CONTRIBUTOR: 2,
    ProjectRole.READER: 1,
}


@dataclass
class CurrentUser:
    """Authenticated user context with fresh access data from the database."""

    user_id: str
    email: str
    workspace_ids: list[str] = field(default_factory=list)
    default_workspace_id: str | None = None
    session_version: int = 0
    workspace_owner_ids: list[str] = field(default_factory=list)
    roles: list[str] = field(default_factory=list)

    @property
    def user_uuid(self) -> UUID:
        return UUID(self.user_id)

    def is_owner_for(self, workspace_id: UUID | str) -> bool:
        workspace_id_str = str(workspace_id)
        return workspace_id_str in self.workspace_owner_ids


@dataclass
class ProjectAccess:
    """Resolved active project scope for the current request."""

    project_id: UUID
    workspace_id: UUID
    role: ProjectRole
    is_default: bool = False


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """Read and verify the session cookie, then refresh access from the database."""
    from app.api.v1.routers.auth import _read_session_cookie
    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.user import UserModel

    payload = _read_session_cookie(request)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    principal: dict[str, Any] = payload.get("principal", {})
    user_id = principal.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    try:
        user_uuid = UUID(user_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        ) from err

    user = await session.get(UserModel, user_uuid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    principal_session_version = principal.get("session_version", user.session_version)
    if principal_session_version != user.session_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )

    membership_stmt = select(MembershipModel).where(MembershipModel.user_id == user_uuid)
    memberships = (await session.execute(membership_stmt)).scalars().all()
    workspace_ids = [str(m.workspace_id) for m in memberships]
    workspace_owner_ids = [str(m.workspace_id) for m in memberships if m.is_owner]

    return CurrentUser(
        user_id=str(user.id),
        email=user.email,
        workspace_ids=workspace_ids,
        default_workspace_id=str(user.default_workspace_id)
        if user.default_workspace_id
        else None,
        session_version=user.session_version,
        workspace_owner_ids=workspace_owner_ids,
        roles=principal.get("roles", []),
    )


def require_workspace(
    user: CurrentUser = Depends(get_current_user),
    x_workspace_id: str | None = Header(None),
) -> UUID:
    """Extract and validate the active workspace ID."""
    wid: str | None = x_workspace_id

    if not wid and user.default_workspace_id in user.workspace_ids:
        wid = user.default_workspace_id
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


async def require_workspace_membership(
    workspace_id: UUID = Depends(require_workspace),
    user: CurrentUser = Depends(get_current_user),
) -> UUID:
    """Require access to the active workspace."""
    if str(workspace_id) not in user.workspace_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this workspace",
        )
    return workspace_id


async def require_workspace_owner(
    workspace_id: UUID = Depends(require_workspace),
    user: CurrentUser = Depends(get_current_user),
) -> UUID:
    """Require workspace ownership for the active workspace."""
    if not user.is_owner_for(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )
    return workspace_id


def require_project_role(min_role: ProjectRole):
    """Build a dependency that requires at least ``min_role`` in the active project."""

    async def dependency(
        session: AsyncSession = Depends(get_session),
        user: CurrentUser = Depends(get_current_user),
        workspace_id: UUID = Depends(require_workspace),
        x_project_id: str | None = Header(None),
    ) -> ProjectAccess:
        from app.infrastructure.db.models.project import ProjectModel
        from app.infrastructure.db.models.project_membership import (
            ProjectMembershipModel,
        )

        project_id_str = x_project_id
        if not project_id_str:
            default_stmt = select(ProjectModel).where(
                ProjectModel.workspace_id == workspace_id,
                ProjectModel.is_default.is_(True),
            )
            default_project = (await session.execute(default_stmt)).scalar_one_or_none()
            if default_project is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No active project. Create a project first.",
                )
            project = default_project
        else:
            try:
                project_uuid = UUID(project_id_str)
            except ValueError as err:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid project ID format",
                ) from err
            project_stmt = select(ProjectModel).where(
                ProjectModel.id == project_uuid,
                ProjectModel.workspace_id == workspace_id,
            )
            project = (await session.execute(project_stmt)).scalar_one_or_none()
            if project is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found",
                )

        membership_stmt = select(ProjectMembershipModel).where(
            ProjectMembershipModel.project_id == project.id,
            ProjectMembershipModel.user_id == user.user_uuid,
        )
        project_membership = (
            await session.execute(membership_stmt)
        ).scalar_one_or_none()
        if project_membership is None:
            if user.is_owner_for(workspace_id):
                return ProjectAccess(
                    project_id=project.id,
                    workspace_id=workspace_id,
                    role=ProjectRole.ADMIN,
                    is_default=project.is_default,
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        role = ProjectRole(project_membership.role)
        if PROJECT_ROLE_HIERARCHY[role] < PROJECT_ROLE_HIERARCHY[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires at least {min_role.value} project role",
            )

        return ProjectAccess(
            project_id=project.id,
            workspace_id=workspace_id,
            role=role,
            is_default=project.is_default,
        )

    return dependency


async def require_project_reader(
    project_access: ProjectAccess = Depends(require_project_role(ProjectRole.READER)),
) -> ProjectAccess:
    """Require at least reader access to the active project."""
    return project_access


async def require_project_contributor(
    project_access: ProjectAccess = Depends(
        require_project_role(ProjectRole.CONTRIBUTOR)
    ),
) -> ProjectAccess:
    """Require at least contributor access to the active project."""
    return project_access


async def require_project_admin(
    project_access: ProjectAccess = Depends(require_project_role(ProjectRole.ADMIN)),
) -> ProjectAccess:
    """Require admin access to the active project."""
    return project_access


async def allow_user(client_key: str = Query(...)) -> None:
    """Legacy API-key dependency kept for backward compatibility."""
    key = os.getenv("KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not secrets.compare_digest(key, client_key):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized. Make sure you have the correct Key.",
        )
