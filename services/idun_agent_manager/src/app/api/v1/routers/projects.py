"""Project API.

Endpoints for managing projects and project memberships within a workspace.
Projects are subdivisions within workspaces for organizing resources.
All CRUD operations enforce RBAC via workspace ownership and project roles.
"""

import logging
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_project_role,
    require_workspace,
)
from app.api.v1.schemas.workspace_members import (
    ProjectMemberAdd,
    ProjectMemberListResponse,
    ProjectMemberPatch,
    ProjectMemberRead,
    ProjectRole,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.infrastructure.db.models.managed_integration import ManagedIntegrationModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel
from app.infrastructure.db.models.managed_sso import ManagedSSOModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.user import UserModel

router = APIRouter()

logger = logging.getLogger(__name__)

# All resource models that carry a project_id FK.
RESOURCE_MODELS = [
    ManagedAgentModel,
    ManagedGuardrailModel,
    ManagedIntegrationModel,
    ManagedMCPServerModel,
    ManagedMemoryModel,
    ManagedObservabilityModel,
    ManagedSSOModel,
]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProjectRead(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    is_default: bool
    workspace_id: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class ProjectPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class ProjectDeleteInfo(BaseModel):
    """Returned on the first DELETE call so the frontend can show a
    confirmation dialog with resource counts before committing."""

    project_id: str
    project_name: str
    resource_counts: dict[str, int]
    total_resources: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _model_to_schema(model: ProjectModel) -> ProjectRead:
    return ProjectRead(
        id=str(model.id),
        name=model.name,
        slug=model.slug,
        description=model.description,
        is_default=model.is_default,
        workspace_id=str(model.workspace_id),
        created_by=str(model.created_by) if model.created_by else None,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


async def _get_project(
    project_id: str,
    session: AsyncSession,
    workspace_id: UUID,
) -> ProjectModel:
    try:
        pid = UUID(project_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project id format",
        ) from err

    model = await session.get(ProjectModel, pid)
    if not model or model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id '{project_id}' not found",
        )
    return model


async def _get_workspace_membership(
    user: CurrentUser,
    workspace_id: UUID,
    session: AsyncSession,
) -> MembershipModel:
    """Return the workspace membership row for the current user.

    Raises 403 if the user is not a member of the workspace.
    """
    stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    membership = (await session.execute(stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )
    return membership


async def _require_workspace_owner(
    user: CurrentUser,
    workspace_id: UUID,
    session: AsyncSession,
) -> MembershipModel:
    """Return the workspace membership and assert ownership."""
    membership = await _get_workspace_membership(user, workspace_id, session)
    if not membership.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can perform this action",
        )
    return membership


async def _resource_counts_for_project(
    project_id: UUID,
    session: AsyncSession,
) -> dict[str, int]:
    """Count resources assigned to *project_id* across all resource tables."""
    counts: dict[str, int] = {}
    for model_cls in RESOURCE_MODELS:
        stmt = (
            select(func.count())
            .select_from(model_cls)
            .where(model_cls.project_id == project_id)
        )
        result = await session.execute(stmt)
        count = result.scalar_one()
        # Derive a human-friendly key from the model name, e.g.
        # ManagedAgentModel -> "agents"
        key = (
            model_cls.__tablename__
            .removeprefix("managed_")
            .removesuffix("s")
            + "s"
        )
        counts[key] = count
    return counts


def _can_grant_role(
    grantor_is_workspace_owner: bool,
    grantor_project_role: str,
    target_role: ProjectRole,
) -> bool:
    """Determine whether the grantor may assign *target_role*.

    - Workspace owners can assign any role including admin.
    - Project admins can only assign contributor or reader.
    """
    if grantor_is_workspace_owner:
        return True
    if grantor_project_role == "admin":
        return target_role in (ProjectRole.CONTRIBUTOR, ProjectRole.READER)
    return False


# ---------------------------------------------------------------------------
# Project CRUD endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[ProjectRead],
    summary="List projects for current workspace",
)
async def list_projects(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ProjectRead]:
    """Return projects the current user has access to.

    Workspace owners see all projects. Regular members only see projects
    where they have an explicit membership.
    """
    membership = await _get_workspace_membership(user, workspace_id, session)

    if membership.is_owner:
        stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id
        )
    else:
        stmt = (
            select(ProjectModel)
            .join(
                ProjectMembershipModel,
                ProjectMembershipModel.project_id == ProjectModel.id,
            )
            .where(
                ProjectModel.workspace_id == workspace_id,
                ProjectMembershipModel.user_id == UUID(user.user_id),
            )
        )

    stmt = (
        stmt.order_by(ProjectModel.is_default.desc(), ProjectModel.created_at)
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [_model_to_schema(p) for p in rows]


@router.post(
    "/",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
)
async def create_project(
    request: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectRead:
    """Create a project in the active workspace.

    Only workspace owners can create projects. After creation, all workspace
    owners are automatically added as project admins.
    """
    await _require_workspace_owner(user, workspace_id, session)

    project_id = uuid4()
    now = datetime.now(UTC)

    project = ProjectModel(
        id=project_id,
        name=request.name,
        slug=f"proj-{project_id.hex[:8]}",
        description=request.description,
        is_default=False,
        workspace_id=workspace_id,
        created_by=UUID(user.user_id),
        created_at=now,
        updated_at=now,
    )
    session.add(project)
    await session.flush()

    # Auto-create project memberships for ALL workspace owners.
    owner_stmt = select(MembershipModel).where(
        MembershipModel.workspace_id == workspace_id,
        MembershipModel.is_owner.is_(True),
    )
    owner_result = await session.execute(owner_stmt)
    owners = owner_result.scalars().all()

    for owner in owners:
        pm = ProjectMembershipModel(
            id=uuid4(),
            project_id=project_id,
            user_id=owner.user_id,
            role=ProjectRole.ADMIN.value,
        )
        session.add(pm)

    await session.flush()
    await session.refresh(project)

    return _model_to_schema(project)


@router.get(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Get project by ID",
)
async def get_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectRead:
    """Get a project by ID. Requires at least reader access."""
    model = await _get_project(project_id, session, workspace_id)

    # Enforce RBAC: user must have at least reader role.
    await require_project_role(model.id, user, session, "reader")

    return _model_to_schema(model)


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Update project",
)
async def patch_project(
    project_id: str,
    request: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectRead:
    """Update a project's name or description. Requires project admin role."""
    model = await _get_project(project_id, session, workspace_id)

    # Enforce RBAC: must be project admin.
    await require_project_role(model.id, user, session, "admin")

    if request.name is not None:
        model.name = request.name
    if request.description is not None:
        model.description = request.description
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.delete(
    "/{project_id}",
    summary="Delete project",
    response_model=None,
    responses={
        200: {
            "description": "Resource counts returned for confirmation dialog",
            "model": ProjectDeleteInfo,
        },
        204: {"description": "Project deleted successfully"},
    },
)
async def delete_project(
    project_id: str,
    action: Literal["move", "delete_resources"] | None = Query(default=None),
    target_project_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectDeleteInfo | Response:
    """Delete a project. Only workspace owners can delete projects.

    **Two-step flow:**

    1. First call without ``action``: returns resource counts so the frontend
       can display a confirmation dialog.
    2. Second call with ``action=move&target_project_id=<uuid>`` or
       ``action=delete_resources``: executes the deletion.

    Cannot delete the default project.
    """
    await _require_workspace_owner(user, workspace_id, session)

    model = await _get_project(project_id, session, workspace_id)

    if model.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default project",
        )

    pid = model.id

    # --- Step 1: no action specified -- return resource counts ---------------
    if action is None:
        counts = await _resource_counts_for_project(pid, session)
        total = sum(counts.values())
        return ProjectDeleteInfo(
            project_id=str(pid),
            project_name=model.name,
            resource_counts=counts,
            total_resources=total,
        )

    # --- Step 2: action specified -- perform the deletion --------------------
    if action == "move":
        if not target_project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_project_id is required when action is 'move'",
            )
        target = await _get_project(target_project_id, session, workspace_id)
        if target.id == pid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target project cannot be the same as the project being deleted",
            )

        # Move resources from the deleted project to the target project.
        for model_cls in RESOURCE_MODELS:
            stmt = (
                update(model_cls)
                .where(model_cls.project_id == pid)
                .values(project_id=target.id)
            )
            await session.execute(stmt)

    elif action == "delete_resources":
        # Resources will be cascade-deleted along with the project rows,
        # or we explicitly delete them to be explicit.
        for model_cls in RESOURCE_MODELS:
            stmt = model_cls.__table__.delete().where(
                model_cls.project_id == pid
            )
            await session.execute(stmt)

    # Delete project memberships and the project itself (CASCADE handles
    # memberships, but we are explicit).
    await session.delete(model)
    await session.flush()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Project member management endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/members",
    response_model=ProjectMemberListResponse,
    summary="List project members",
)
async def list_project_members(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberListResponse:
    """List all members of a project. Requires at least reader role."""
    project = await _get_project(project_id, session, workspace_id)
    await require_project_role(project.id, user, session, "reader")

    stmt = (
        select(ProjectMembershipModel, UserModel, MembershipModel)
        .join(UserModel, UserModel.id == ProjectMembershipModel.user_id)
        .join(
            MembershipModel,
            (MembershipModel.user_id == ProjectMembershipModel.user_id)
            & (MembershipModel.workspace_id == workspace_id),
        )
        .where(ProjectMembershipModel.project_id == project.id)
        .order_by(ProjectMembershipModel.created_at)
    )
    result = await session.execute(stmt)
    rows = result.all()

    members = [
        ProjectMemberRead(
            id=str(pm.id),
            user_id=str(pm.user_id),
            email=u.email,
            name=u.name,
            picture_url=u.picture_url,
            role=ProjectRole(pm.role),
            is_workspace_owner=m.is_owner,
            created_at=pm.created_at,
        )
        for pm, u, m in rows
    ]

    return ProjectMemberListResponse(members=members, total=len(members))


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add member to project",
)
async def add_project_member(
    project_id: str,
    request: ProjectMemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberRead:
    """Add a workspace member to a project with a given role.

    Requires project admin role. Workspace owners can assign any role;
    project admins can only assign contributor or reader.
    """
    project = await _get_project(project_id, session, workspace_id)
    access = await require_project_role(project.id, user, session, "admin")

    # Validate the target user is a workspace member.
    try:
        target_user_id = UUID(request.user_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user_id format",
        ) from err

    target_ws_stmt = select(MembershipModel).where(
        MembershipModel.user_id == target_user_id,
        MembershipModel.workspace_id == workspace_id,
    )
    target_membership = (await session.execute(target_ws_stmt)).scalar_one_or_none()
    if target_membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this workspace",
        )

    # Check role-grant permissions.
    if not _can_grant_role(access.is_workspace_owner, access.role, request.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to assign this role. "
            "Only workspace owners can assign the admin role.",
        )

    # Check for existing membership.
    existing_stmt = select(ProjectMembershipModel).where(
        ProjectMembershipModel.project_id == project.id,
        ProjectMembershipModel.user_id == target_user_id,
    )
    existing = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    pm = ProjectMembershipModel(
        id=uuid4(),
        project_id=project.id,
        user_id=target_user_id,
        role=request.role.value,
    )
    session.add(pm)
    await session.flush()

    # Fetch user details for the response.
    target_user = await session.get(UserModel, target_user_id)

    return ProjectMemberRead(
        id=str(pm.id),
        user_id=str(pm.user_id),
        email=target_user.email,  # type: ignore[union-attr]
        name=target_user.name if target_user else None,  # type: ignore[union-attr]
        picture_url=target_user.picture_url if target_user else None,  # type: ignore[union-attr]
        role=ProjectRole(pm.role),
        is_workspace_owner=target_membership.is_owner,
        created_at=pm.created_at,
    )


@router.patch(
    "/{project_id}/members/{membership_id}",
    response_model=ProjectMemberRead,
    summary="Update project member role",
)
async def patch_project_member(
    project_id: str,
    membership_id: str,
    request: ProjectMemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberRead:
    """Change a project member's role.

    Requires project admin role. Workspace owners can set any role;
    project admins can only assign contributor or reader.
    """
    project = await _get_project(project_id, session, workspace_id)
    access = await require_project_role(project.id, user, session, "admin")

    try:
        mid = UUID(membership_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid membership_id format",
        ) from err

    pm = await session.get(ProjectMembershipModel, mid)
    if pm is None or pm.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )

    # Check role-grant permissions.
    if not _can_grant_role(access.is_workspace_owner, access.role, request.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to assign this role. "
            "Only workspace owners can assign the admin role.",
        )

    pm.role = request.role.value
    await session.flush()
    await session.refresh(pm)

    # Invalidate the target user's session so they pick up new permissions.
    target_user = await session.get(UserModel, pm.user_id)
    if target_user is not None:
        target_user.session_version += 1
        await session.flush()

    # Fetch related data for the response.
    ws_stmt = select(MembershipModel).where(
        MembershipModel.user_id == pm.user_id,
        MembershipModel.workspace_id == workspace_id,
    )
    ws_membership = (await session.execute(ws_stmt)).scalar_one_or_none()

    return ProjectMemberRead(
        id=str(pm.id),
        user_id=str(pm.user_id),
        email=target_user.email if target_user else "",
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        role=ProjectRole(pm.role),
        is_workspace_owner=ws_membership.is_owner if ws_membership else False,
        created_at=pm.created_at,
    )


@router.delete(
    "/{project_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member from project",
)
async def remove_project_member(
    project_id: str,
    membership_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Remove a member from a project. Requires project admin role.

    Cannot remove workspace owners -- they always retain access to all
    projects in their workspace.
    """
    project = await _get_project(project_id, session, workspace_id)
    await require_project_role(project.id, user, session, "admin")

    try:
        mid = UUID(membership_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid membership_id format",
        ) from err

    pm = await session.get(ProjectMembershipModel, mid)
    if pm is None or pm.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )

    # Workspace owners cannot be removed from projects.
    ws_stmt = select(MembershipModel).where(
        MembershipModel.user_id == pm.user_id,
        MembershipModel.workspace_id == workspace_id,
    )
    ws_membership = (await session.execute(ws_stmt)).scalar_one_or_none()
    if ws_membership and ws_membership.is_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove a workspace owner from a project. "
            "Workspace owners always have access to all projects.",
        )

    # Invalidate the removed user's session.
    removed_user = await session.get(UserModel, pm.user_id)
    if removed_user is not None:
        removed_user.session_version += 1

    await session.delete(pm)
    await session.flush()
