"""Project API.

Endpoints for managing projects within a workspace.
Projects are subdivisions within workspaces for organizing resources.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.project_resource import ProjectResourceModel

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

# Each entry: (model class, name column expression)
_RESOURCE_TABLES: list[tuple[type, str, str]] = [
    (ManagedAgentModel, "agent", "name"),
    (ManagedMCPServerModel, "mcp_server", "name"),
    (ManagedGuardrailModel, "guardrail", "name"),
    (ManagedObservabilityModel, "observability", "name"),
    (ManagedMemoryModel, "memory", "name"),
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

    # Find resources that are ONLY in this project (no other project assignments)
    # These need to be reassigned to the default project
    orphan_stmt = (
        select(
            ProjectResourceModel.resource_id,
            ProjectResourceModel.resource_type,
        )
        .where(ProjectResourceModel.project_id == pid)
        .where(
            ~ProjectResourceModel.resource_id.in_(
                select(ProjectResourceModel.resource_id).where(
                    ProjectResourceModel.project_id != pid
                )
            )
        )
    )
    orphan_result = await session.execute(orphan_stmt)
    orphans = orphan_result.all()

    if orphans:
        # Get the default project for this workspace
        default_stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
            ProjectModel.is_default.is_(True),
        )
        default_result = await session.execute(default_stmt)
        default_project = default_result.scalar_one_or_none()

        # If deleting the default project, pick another project as target
        if default_project is None or default_project.id == pid:
            fallback_stmt = (
                select(ProjectModel)
                .where(
                    ProjectModel.workspace_id == workspace_id,
                    ProjectModel.id != pid,
                )
                .limit(1)
            )
            fallback_result = await session.execute(fallback_stmt)
            default_project = fallback_result.scalar_one()

        for resource_id, resource_type in orphans:
            assignment = ProjectResourceModel(
                id=uuid4(),
                project_id=default_project.id,
                resource_id=resource_id,
                resource_type=resource_type,
            )
            session.add(assignment)

        await session.flush()

    # CASCADE will delete project_resources and project_memberships rows
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

        # Migrate all 5 resource tables
        for model_cls, _resource_type, _name_col in _RESOURCE_TABLES:
            await session.execute(
                update(model_cls)
                .where(getattr(model_cls, "project_id") == project.id)
                .values(project_id=target_project.id)
            )

        # Migrate project_resources rows
        await session.execute(
            update(ProjectResourceModel)
            .where(ProjectResourceModel.project_id == project.id)
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
    """List resource assignments for a project."""
    project = await _get_project(project_id, session, workspace_id)

    stmt = select(ProjectResourceModel).where(
        ProjectResourceModel.project_id == project.id
    )
    if resource_type:
        stmt = stmt.where(ProjectResourceModel.resource_type == resource_type)

    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [
        ResourceAssignmentRead(
            id=str(r.id),
            project_id=str(r.project_id),
            resource_id=str(r.resource_id),
            resource_type=r.resource_type,
        )
        for r in rows
    ]


@router.post(
    "/{project_id}/resources",
    response_model=ResourceAssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign resource to project",
)
async def assign_resource_to_project(
    project_id: str,
    request: ResourceAssignment,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ResourceAssignmentRead:
    """Assign a resource to a project."""
    project = await _get_project(project_id, session, workspace_id)

    try:
        resource_uuid = UUID(request.resource_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource_id format",
        ) from err

    # Check if assignment already exists
    existing_stmt = select(ProjectResourceModel).where(
        ProjectResourceModel.project_id == project.id,
        ProjectResourceModel.resource_id == resource_uuid,
        ProjectResourceModel.resource_type == request.resource_type,
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resource is already assigned to this project",
        )

    assignment = ProjectResourceModel(
        id=uuid4(),
        project_id=project.id,
        resource_id=resource_uuid,
        resource_type=request.resource_type,
    )
    session.add(assignment)
    await session.flush()

    return ResourceAssignmentRead(
        id=str(assignment.id),
        project_id=str(assignment.project_id),
        resource_id=str(assignment.resource_id),
        resource_type=assignment.resource_type,
    )


@router.delete(
    "/{project_id}/resources/{resource_type}/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove resource from project",
)
async def remove_resource_from_project(
    project_id: str,
    resource_type: str,
    resource_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Remove a resource from a project.

    Cannot remove if it's the resource's only project assignment.
    """
    project = await _get_project(project_id, session, workspace_id)

    try:
        resource_uuid = UUID(resource_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource_id format",
        ) from err

    # Check total assignments for this resource
    count_stmt = select(ProjectResourceModel).where(
        ProjectResourceModel.resource_id == resource_uuid,
        ProjectResourceModel.resource_type == resource_type,
    )
    count_result = await session.execute(count_stmt)
    all_assignments = count_result.scalars().all()

    if len(all_assignments) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove resource from its only project. Move it to another project first.",
        )

    # Delete the specific assignment
    del_stmt = delete(ProjectResourceModel).where(
        and_(
            ProjectResourceModel.project_id == project.id,
            ProjectResourceModel.resource_id == resource_uuid,
            ProjectResourceModel.resource_type == resource_type,
        )
    )
    result = await session.execute(del_stmt)
    if result.rowcount == 0:  # type: ignore[union-attr]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource assignment not found",
        )
