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

from app.api.v1.deps import CurrentUser, get_current_user, get_session
from app.infrastructure.db.models.membership import MembershipModel
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
        select(WorkspaceModel)
        .join(MembershipModel, MembershipModel.workspace_id == WorkspaceModel.id)
        .where(MembershipModel.user_id == UUID(user.user_id))
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [
        WorkspaceRead(
            id=str(w.id),
            name=w.name,
            slug=w.slug,
        )
        for w in rows
    ]


@router.post(
    "/",
    response_model=WorkspaceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
async def create_workspace(
    request: WorkspaceCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> WorkspaceRead:
    """Create a workspace and add the current user as admin."""
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
        role="admin",
    )
    session.add(membership)
    await session.flush()

    return WorkspaceRead(
        id=str(workspace.id),
        name=workspace.name,
        slug=workspace.slug,
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
    """Update a workspace name (admin only)."""
    try:
        ws_uuid = UUID(workspace_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace id",
        ) from err

    # Verify membership
    mem_stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == ws_uuid,
    )
    mem_result = await session.execute(mem_stmt)
    membership = mem_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    if membership.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update workspace settings",
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

    return WorkspaceRead(
        id=str(workspace.id),
        name=workspace.name,
        slug=workspace.slug,
    )


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace (admin only)",
)
async def delete_workspace(
    workspace_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Delete a workspace. Only admins can delete workspaces."""
    try:
        ws_uuid = UUID(workspace_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace id",
        ) from err

    # Verify admin membership
    mem_stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == ws_uuid,
    )
    mem_result = await session.execute(mem_stmt)
    membership = mem_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    if membership.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete workspaces",
        )

    workspace = await session.get(WorkspaceModel, ws_uuid)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    await session.delete(workspace)
    await session.flush()
