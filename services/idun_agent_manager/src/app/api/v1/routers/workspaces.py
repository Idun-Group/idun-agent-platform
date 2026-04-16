"""Workspace API.

Endpoints for managing workspaces and viewing membership.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
)
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.user import UserModel
from app.infrastructure.db.models.workspace import WorkspaceModel

router = APIRouter()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class WorkspaceRead(BaseModel):
    id: str
    name: str
    slug: str
    icon: str = ""
    description: str = ""
    is_owner: bool = False
    default_project_id: str | None = None

    model_config = {"from_attributes": True}


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WorkspacePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[WorkspaceRead],
    summary="List workspaces for current user",
)
async def list_workspaces(
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> list[WorkspaceRead]:
    """Return all workspaces the current user is a member of."""
    stmt = (
        select(WorkspaceModel, MembershipModel.is_owner)
        .join(MembershipModel, MembershipModel.workspace_id == WorkspaceModel.id)
        .where(MembershipModel.user_id == UUID(user.user_id))
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()

    workspace_ids = [workspace.id for workspace, _ in rows]
    default_projects: dict[UUID, str] = {}
    if workspace_ids:
        project_stmt = select(ProjectModel).where(
            ProjectModel.workspace_id.in_(workspace_ids),
            ProjectModel.is_default.is_(True),
        )
        projects = (await session.execute(project_stmt)).scalars().all()
        default_projects = {
            project.workspace_id: str(project.id)
            for project in projects
        }

    return [
        WorkspaceRead(
            id=str(workspace.id),
            name=workspace.name,
            slug=workspace.slug,
            is_owner=is_owner,
            default_project_id=default_projects.get(workspace.id),
        )
        for workspace, is_owner in rows
    ]


@router.post(
    "/",
    response_model=WorkspaceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
async def create_workspace(
    # NOTE: This endpoint intentionally uses get_current_user (not require_workspace)
    # because it must remain accessible to users with no workspaces yet (onboarding flow).
    request: WorkspaceCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> WorkspaceRead:
    """Create a workspace and add the current user as owner."""
    ws_id = uuid4()
    now = datetime.now(UTC)

    workspace = WorkspaceModel(
        id=ws_id,
        name=request.name,
        slug=f"ws-{ws_id.hex[:8]}",
        created_at=now,
        updated_at=now,
    )
    session.add(workspace)
    await session.flush()

    membership = MembershipModel(
        id=uuid4(),
        user_id=UUID(user.user_id),
        workspace_id=ws_id,
        is_owner=True,
    )
    session.add(membership)
    await session.flush()

    default_project = ProjectModel(
        id=uuid4(),
        workspace_id=ws_id,
        name="Default Project",
        description="Automatically created default project",
        created_by=UUID(user.user_id),
        is_default=True,
        created_at=now,
        updated_at=now,
    )
    session.add(default_project)
    await session.flush()

    project_membership = ProjectMembershipModel(
        id=uuid4(),
        project_id=default_project.id,
        user_id=UUID(user.user_id),
        role="admin",
    )
    session.add(project_membership)
    await session.flush()

    # Set as default workspace if user doesn't have one yet
    user_model = await session.get(UserModel, UUID(user.user_id))
    if user_model and user_model.default_workspace_id is None:
        user_model.default_workspace_id = ws_id
        await session.flush()

    return WorkspaceRead(
        id=str(workspace.id),
        name=workspace.name,
        slug=workspace.slug,
        is_owner=True,
        default_project_id=str(default_project.id),
    )


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceRead,
    summary="Update workspace",
)
async def patch_workspace(
    workspace_id: str,
    request: WorkspacePatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> WorkspaceRead:
    """Update a workspace name. Requires workspace owner access."""
    try:
        ws_uuid = UUID(workspace_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace id",
        ) from err

    if not user.is_owner_for(ws_uuid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )

    workspace = await session.get(WorkspaceModel, ws_uuid)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    if request.name is not None:
        workspace.name = request.name
    workspace.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(workspace)

    default_project = (
        await session.execute(
            select(ProjectModel).where(
                ProjectModel.workspace_id == workspace.id,
                ProjectModel.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()

    return WorkspaceRead(
        id=str(workspace.id),
        name=workspace.name,
        slug=workspace.slug,
        is_owner=True,
        default_project_id=str(default_project.id) if default_project else None,
    )


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace (owner only)",
)
async def delete_workspace(
    workspace_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Delete a workspace. Only owners can delete workspaces."""
    try:
        ws_uuid = UUID(workspace_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace id",
        ) from err

    if not user.is_owner_for(ws_uuid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )

    workspace = await session.get(WorkspaceModel, ws_uuid)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    await session.delete(workspace)
    await session.flush()
