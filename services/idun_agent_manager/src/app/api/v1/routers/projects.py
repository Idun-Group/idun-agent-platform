"""Project API.

Endpoints for managing projects within a workspace.
Projects are subdivisions within workspaces for organizing resources.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    check_project_access,
    get_current_user,
    get_session,
    require_workspace,
)
from app.api.v1.schemas.workspace_members import (
    ProjectMemberAdd,
    ProjectMemberListResponse,
    ProjectMemberPatch,
    ProjectMemberRead,
    ProjectRole,
)
from app.infrastructure.db.models.user import UserModel
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

router = APIRouter()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProjectRead(BaseModel):
    id: str
    name: str
    slug: str
    is_default: bool
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ProjectPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class ResourceAssignment(BaseModel):
    resource_id: str
    resource_type: str = Field(
        ...,
        pattern="^(agent|mcp_server|observability|memory|guardrail|integration|sso)$",
    )


class ResourceAssignmentRead(BaseModel):
    id: str
    project_id: str
    resource_id: str
    resource_type: str


class ProjectDeleteResource(BaseModel):
    resource_id: str
    resource_type: str
    resource_name: str


class ProjectDeletePlan(BaseModel):
    project_id: str
    project_name: str
    resources: list[ProjectDeleteResource]


class ProjectDeleteAction(BaseModel):
    move_resources_to: str | None = Field(
        None,
        description=(
            "Project ID to move resources to. "
            "If None, resources are deleted with the project."
        ),
    )


# ---------------------------------------------------------------------------
# Resource table registry for delete-preview / migration
# ---------------------------------------------------------------------------

# Each entry: (model class, resource_type label, name column)
_RESOURCE_TABLES: list[tuple[type, str, str]] = [
    (ManagedAgentModel, "agent", "name"),
    (ManagedMCPServerModel, "mcp_server", "name"),
    (ManagedGuardrailModel, "guardrail", "name"),
    (ManagedObservabilityModel, "observability", "name"),
    (ManagedMemoryModel, "memory", "name"),
    (ManagedIntegrationModel, "integration", "name"),
    (ManagedSSOModel, "sso", "name"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _model_to_schema(model: ProjectModel) -> ProjectRead:
    return ProjectRead(
        id=str(model.id),
        name=model.name,
        slug=model.slug,
        is_default=model.is_default,
        workspace_id=str(model.workspace_id),
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


async def _require_workspace_owner(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
) -> MembershipModel:
    """Verify the current user is an owner of the workspace.

    Returns the MembershipModel on success.
    Raises 404 if the user is not a member, 403 if not an owner.
    """
    stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    membership = (await session.execute(stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    if not membership.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can perform this action",
        )
    return membership


async def _get_workspace_membership(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
) -> MembershipModel:
    """Return the workspace membership for the current user.

    Raises 404 if the user is not a member.
    """
    stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    membership = (await session.execute(stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    return membership


# ---------------------------------------------------------------------------
# Project CRUD endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[ProjectRead],
    summary="List projects for current workspace",
)
async def list_projects(
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ProjectRead]:
    """Return projects in the active workspace.

    Owners see all projects. Non-owners see only projects where they
    have a project membership.
    """
    membership = await _get_workspace_membership(workspace_id, user, session)

    if membership.is_owner:
        stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
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
    """Create a project in the active workspace. Requires workspace owner."""
    await _require_workspace_owner(workspace_id, user, session)

    project_id = uuid4()
    now = datetime.now(UTC)

    project = ProjectModel(
        id=project_id,
        name=request.name,
        slug=f"proj-{project_id.hex[:8]}",
        is_default=False,
        workspace_id=workspace_id,
        created_at=now,
        updated_at=now,
    )
    session.add(project)
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
    """Get a project by ID."""
    model = await _get_project(project_id, session, workspace_id)
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
    """Update a project name. Requires workspace owner."""
    await _require_workspace_owner(workspace_id, user, session)

    model = await _get_project(project_id, session, workspace_id)

    if request.name is not None:
        model.name = request.name
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete project",
)
async def delete_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a project. Requires workspace owner.

    Cannot delete the last project in a workspace.
    Resources only in this project are reassigned to the default project.
    """
    await _require_workspace_owner(workspace_id, user, session)

    model = await _get_project(project_id, session, workspace_id)

    # Prevent deleting the last project
    project_count_stmt = (
        select(func.count())
        .select_from(ProjectModel)
        .where(ProjectModel.workspace_id == workspace_id)
    )
    project_count = (await session.execute(project_count_stmt)).scalar_one()
    if project_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the last project in a workspace",
        )

    pid = model.id

    # Move all resources in this project to a fallback project.
    # Resources have a direct project_id FK with CASCADE, so without
    # migration they'd be deleted along with the project.
    default_stmt = select(ProjectModel).where(
        ProjectModel.workspace_id == workspace_id,
        ProjectModel.is_default.is_(True),
    )
    default_project = (await session.execute(default_stmt)).scalar_one_or_none()

    # If deleting the default project, pick another as target
    if default_project is None or default_project.id == pid:
        fallback_stmt = (
            select(ProjectModel)
            .where(
                ProjectModel.workspace_id == workspace_id,
                ProjectModel.id != pid,
            )
            .limit(1)
        )
        default_project = (await session.execute(fallback_stmt)).scalar_one()

    # Migrate resources across all resource tables
    for model_cls, _rtype, _name_col in _RESOURCE_TABLES:
        await session.execute(
            update(model_cls)
            .where(getattr(model_cls, "project_id") == pid)
            .values(project_id=default_project.id)
        )

    await session.flush()

    # CASCADE will delete project_memberships rows
    await session.delete(model)
    await session.flush()


# ---------------------------------------------------------------------------
# Delete preview & delete-with-plan endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/delete-preview",
    response_model=ProjectDeletePlan,
    summary="Preview impact of deleting a project",
)
async def delete_preview(
    project_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectDeletePlan:
    """Return all resources that would be affected by deleting this project."""
    await _require_workspace_owner(workspace_id, user, session)

    project = await _get_project(str(project_id), session, workspace_id)

    resources: list[ProjectDeleteResource] = []

    for model_cls, resource_type, name_col in _RESOURCE_TABLES:
        stmt = select(
            getattr(model_cls, "id"),
            getattr(model_cls, name_col),
        ).where(getattr(model_cls, "project_id") == project.id)
        result = await session.execute(stmt)
        for rid, rname in result.all():
            resources.append(
                ProjectDeleteResource(
                    resource_id=str(rid),
                    resource_type=resource_type,
                    resource_name=rname,
                )
            )

    return ProjectDeletePlan(
        project_id=str(project.id),
        project_name=project.name,
        resources=resources,
    )


@router.post(
    "/{project_id}/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete project with optional resource migration",
)
async def delete_project_with_plan(
    project_id: UUID,
    request: ProjectDeleteAction,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a project, optionally moving its resources to another project.

    If move_resources_to is provided, all resources are migrated to that project.
    If None, resources are deleted with the project (CASCADE).
    """
    await _require_workspace_owner(workspace_id, user, session)

    project = await _get_project(str(project_id), session, workspace_id)

    # Prevent deleting the last project
    project_count_stmt = (
        select(func.count())
        .select_from(ProjectModel)
        .where(ProjectModel.workspace_id == workspace_id)
    )
    project_count = (await session.execute(project_count_stmt)).scalar_one()
    if project_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the last project in a workspace",
        )

    if request.move_resources_to is not None:
        target_project = await _get_project(
            request.move_resources_to, session, workspace_id
        )

        # Migrate all resource tables to the target project
        for model_cls, _resource_type, _name_col in _RESOURCE_TABLES:
            await session.execute(
                update(model_cls)
                .where(getattr(model_cls, "project_id") == project.id)
                .values(project_id=target_project.id)
            )

        await session.flush()

    # Delete project_memberships for this project (CASCADE handles this,
    # but being explicit for clarity)
    await session.execute(
        delete(ProjectMembershipModel).where(
            ProjectMembershipModel.project_id == project.id,
        )
    )

    # Delete project (CASCADE handles remaining resources if not migrated)
    await session.delete(project)
    await session.flush()


# ---------------------------------------------------------------------------
# Resource assignment endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/resources",
    response_model=list[ResourceAssignmentRead],
    summary="List resources in a project",
)
async def list_project_resources(
    project_id: str,
    resource_type: str | None = None,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ResourceAssignmentRead]:
    """List resources belonging to a project (via direct project_id FK)."""
    project = await _get_project(project_id, session, workspace_id)

    results: list[ResourceAssignmentRead] = []
    for model_cls, rtype, _name_col in _RESOURCE_TABLES:
        if resource_type and rtype != resource_type:
            continue
        stmt = select(getattr(model_cls, "id")).where(
            getattr(model_cls, "project_id") == project.id
        )
        rows = (await session.execute(stmt)).scalars().all()
        for rid in rows:
            results.append(
                ResourceAssignmentRead(
                    id=str(rid),
                    project_id=str(project.id),
                    resource_id=str(rid),
                    resource_type=rtype,
                )
            )
    return results


@router.post(
    "/{project_id}/resources",
    response_model=ResourceAssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Move a resource to this project",
)
async def assign_resource_to_project(
    project_id: str,
    request: ResourceAssignment,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ResourceAssignmentRead:
    """Move a resource to a project by setting its project_id FK."""
    project = await _get_project(project_id, session, workspace_id)

    try:
        resource_uuid = UUID(request.resource_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource_id format",
        ) from err

    # Find the resource in the matching table
    model_cls = None
    for cls, rtype, _name_col in _RESOURCE_TABLES:
        if rtype == request.resource_type:
            model_cls = cls
            break

    if model_cls is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown resource_type: {request.resource_type}",
        )

    resource = await session.get(model_cls, resource_uuid)
    if resource is None or resource.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found",
        )

    if resource.project_id == project.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resource is already in this project",
        )

    resource.project_id = project.id
    await session.flush()

    return ResourceAssignmentRead(
        id=str(resource.id),
        project_id=str(project.id),
        resource_id=str(resource.id),
        resource_type=request.resource_type,
    )


# ---------------------------------------------------------------------------
# Project member management endpoints
# ---------------------------------------------------------------------------


async def _require_owner_or_project_admin(
    workspace_id: UUID,
    user: CurrentUser,
    project_id: UUID,
    session: AsyncSession,
) -> None:
    """Verify the caller is a workspace owner or a project admin.

    Raises 403 if the user lacks sufficient privileges.
    """
    await check_project_access(
        user_id=UUID(user.user_id),
        workspace_id=workspace_id,
        project_id=project_id,
        min_role=ProjectRole.ADMIN,
        session=session,
    )


def _membership_to_schema(
    pm: ProjectMembershipModel,
    u: UserModel,
    *,
    is_workspace_owner: bool = False,
) -> ProjectMemberRead:
    return ProjectMemberRead(
        id=str(pm.id),
        user_id=str(u.id),
        email=u.email,
        name=u.name,
        picture_url=u.picture_url,
        role=ProjectRole(pm.role),
        is_workspace_owner=is_workspace_owner,
        created_at=pm.created_at,
    )


@router.get(
    "/{project_id}/members",
    response_model=ProjectMemberListResponse,
    summary="List project members",
)
async def list_project_members(
    project_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberListResponse:
    """List project members. Workspace owners are shown as implicit admin."""
    # Verify the project exists in this workspace
    project = await _get_project(str(project_id), session, workspace_id)

    # Verify caller has at least READER access (or is workspace owner)
    await check_project_access(
        user_id=UUID(user.user_id),
        workspace_id=workspace_id,
        project_id=project.id,
        min_role=ProjectRole.READER,
        session=session,
    )

    # Fetch explicit project memberships with user details
    pm_stmt = (
        select(ProjectMembershipModel, UserModel)
        .join(UserModel, ProjectMembershipModel.user_id == UserModel.id)
        .where(ProjectMembershipModel.project_id == project.id)
        .order_by(ProjectMembershipModel.created_at)
    )
    pm_result = await session.execute(pm_stmt)
    explicit_rows = pm_result.all()

    members: list[ProjectMemberRead] = []

    # Add workspace owners as implicit admin entries
    owner_stmt = (
        select(MembershipModel, UserModel)
        .join(UserModel, MembershipModel.user_id == UserModel.id)
        .where(
            MembershipModel.workspace_id == workspace_id,
            MembershipModel.is_owner.is_(True),
        )
        .order_by(MembershipModel.created_at)
    )
    owner_result = await session.execute(owner_stmt)
    for row in owner_result.all():
        m = row.MembershipModel
        u = row.UserModel
        members.append(
            ProjectMemberRead(
                id=str(m.id),  # use workspace membership id as placeholder
                user_id=str(u.id),
                email=u.email,
                name=u.name,
                picture_url=u.picture_url,
                role=ProjectRole.ADMIN,
                is_workspace_owner=True,
                created_at=m.created_at,
            )
        )

    # Add explicit project members (skip workspace owners already listed)
    for row in explicit_rows:
        pm = row.ProjectMembershipModel
        u = row.UserModel
        if pm.user_id not in {UUID(m.user_id) for m in members}:
            members.append(
                _membership_to_schema(pm, u, is_workspace_owner=False)
            )

    return ProjectMemberListResponse(members=members, total=len(members))


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a workspace member to a project",
)
async def add_project_member(
    project_id: UUID,
    request: ProjectMemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberRead:
    """Add a workspace member to a project with a specific role.

    Only workspace owners or project admins can add members.
    Cannot add workspace owners (they're implicit admin).
    """
    project = await _get_project(str(project_id), session, workspace_id)

    # Verify caller is workspace owner or project admin
    await _require_owner_or_project_admin(workspace_id, user, project.id, session)

    target_user_id = UUID(request.user_id)

    # Verify target user is a workspace member
    ws_mem_stmt = select(MembershipModel).where(
        MembershipModel.user_id == target_user_id,
        MembershipModel.workspace_id == workspace_id,
    )
    ws_membership = (await session.execute(ws_mem_stmt)).scalar_one_or_none()
    if ws_membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this workspace",
        )

    # Cannot add workspace owners — they are implicit admin
    if ws_membership.is_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace owners are implicit project admins and cannot be added explicitly",
        )

    # Check for duplicate project membership
    dup_stmt = select(ProjectMembershipModel).where(
        ProjectMembershipModel.project_id == project.id,
        ProjectMembershipModel.user_id == target_user_id,
    )
    if (await session.execute(dup_stmt)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    # Create project membership row
    now = datetime.now(UTC)
    pm = ProjectMembershipModel(
        id=uuid4(),
        project_id=project.id,
        user_id=target_user_id,
        role=request.role.value,
        created_at=now,
    )
    session.add(pm)
    await session.flush()

    # Fetch user details for the response
    target_user = await session.get(UserModel, target_user_id)
    assert target_user is not None  # already verified via workspace membership

    return _membership_to_schema(pm, target_user, is_workspace_owner=False)


@router.patch(
    "/{project_id}/members/{membership_id}",
    response_model=ProjectMemberRead,
    summary="Update a project member's role",
)
async def update_project_member(
    project_id: UUID,
    membership_id: UUID,
    request: ProjectMemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectMemberRead:
    """Change a project member's role. Owner or project admin only."""
    project = await _get_project(str(project_id), session, workspace_id)

    # Verify caller is workspace owner or project admin
    await _require_owner_or_project_admin(workspace_id, user, project.id, session)

    # Fetch the project membership
    pm = await session.get(ProjectMembershipModel, membership_id)
    if pm is None or pm.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )

    pm.role = request.role.value
    await session.flush()
    await session.refresh(pm)

    target_user = await session.get(UserModel, pm.user_id)
    assert target_user is not None

    return _membership_to_schema(pm, target_user, is_workspace_owner=False)


@router.delete(
    "/{project_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from a project",
)
async def remove_project_member(
    project_id: UUID,
    membership_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Remove a member from a project. Owner or project admin only."""
    project = await _get_project(str(project_id), session, workspace_id)

    # Verify caller is workspace owner or project admin
    await _require_owner_or_project_admin(workspace_id, user, project.id, session)

    # Fetch the project membership
    pm = await session.get(ProjectMembershipModel, membership_id)
    if pm is None or pm.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )

    await session.delete(pm)
    await session.flush()
