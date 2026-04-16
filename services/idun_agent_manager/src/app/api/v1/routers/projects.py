"""Projects API."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.manager.project import (
    ProjectCreate,
    ProjectMemberAdd,
    ProjectMemberPatch,
    ProjectMemberRead,
    ProjectPatch,
    ProjectRead,
    ProjectRole,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    ProjectAccess,
    get_current_user,
    get_session,
    require_project_admin,
    require_project_reader,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.infrastructure.db.models.managed_integration import ManagedIntegrationModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel
from app.infrastructure.db.models.managed_prompt import ManagedPromptModel
from app.infrastructure.db.models.managed_sso import ManagedSSOModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.user import UserModel

router = APIRouter()


def _project_to_schema(
    project: ProjectModel,
    current_user_role: ProjectRole | None,
) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        workspace_id=project.workspace_id,
        name=project.name,
        description=project.description,
        is_default=project.is_default,
        current_user_role=current_user_role,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _parse_uuid(value: str, label: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label} id",
        ) from err


async def _get_project(
    project_id: str,
    session: AsyncSession,
    workspace_id: UUID,
) -> ProjectModel:
    project_uuid = _parse_uuid(project_id, "project")
    project = (
        await session.execute(
            select(ProjectModel).where(
                ProjectModel.id == project_uuid,
                ProjectModel.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def _can_assign_project_role(
    user: CurrentUser,
    workspace_id: UUID,
    role: ProjectRole,
) -> bool:
    if user.is_owner_for(workspace_id):
        return True
    return role in {ProjectRole.CONTRIBUTOR, ProjectRole.READER}


async def _resource_count(session: AsyncSession, project_id: UUID) -> int:
    counts = [
        await session.scalar(select(func.count()).select_from(ManagedAgentModel).where(ManagedAgentModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedPromptModel).where(ManagedPromptModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedGuardrailModel).where(ManagedGuardrailModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedMCPServerModel).where(ManagedMCPServerModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedMemoryModel).where(ManagedMemoryModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedObservabilityModel).where(ManagedObservabilityModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedSSOModel).where(ManagedSSOModel.project_id == project_id)),
        await session.scalar(select(func.count()).select_from(ManagedIntegrationModel).where(ManagedIntegrationModel.project_id == project_id)),
    ]
    return sum(count or 0 for count in counts)


@router.get("/", response_model=list[ProjectRead], summary="List projects")
async def list_projects(
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ProjectRead]:
    """List projects visible in the active workspace."""
    if user.is_owner_for(workspace_id):
        projects = (
            await session.execute(
                select(ProjectModel)
                .where(ProjectModel.workspace_id == workspace_id)
                .order_by(ProjectModel.is_default.desc(), ProjectModel.created_at.asc())
            )
        ).scalars().all()
        return [_project_to_schema(project, ProjectRole.ADMIN) for project in projects]

    rows = (
        await session.execute(
            select(ProjectModel, ProjectMembershipModel.role)
            .join(
                ProjectMembershipModel,
                ProjectMembershipModel.project_id == ProjectModel.id,
            )
            .where(
                ProjectModel.workspace_id == workspace_id,
                ProjectMembershipModel.user_id == user.user_uuid,
            )
            .order_by(ProjectModel.is_default.desc(), ProjectModel.created_at.asc())
        )
    ).all()
    return [
        _project_to_schema(project, ProjectRole(role))
        for project, role in rows
    ]


@router.post(
    "/",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create project",
)
async def create_project(
    request: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectRead:
    """Create a new project in the active workspace."""
    if not user.is_owner_for(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )

    now = datetime.now(UTC)
    project = ProjectModel(
        id=uuid4(),
        workspace_id=workspace_id,
        name=request.name,
        description=request.description,
        created_by=user.user_uuid,
        is_default=False,
        created_at=now,
        updated_at=now,
    )
    session.add(project)
    await session.flush()

    owners = (
        await session.execute(
            select(MembershipModel).where(
                MembershipModel.workspace_id == workspace_id,
                MembershipModel.is_owner.is_(True),
            )
        )
    ).scalars().all()
    for owner_membership in owners:
        session.add(
            ProjectMembershipModel(
                id=uuid4(),
                project_id=project.id,
                user_id=owner_membership.user_id,
                role=ProjectRole.ADMIN.value,
            )
        )
    try:
        await session.flush()
    except IntegrityError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project with this name already exists in the workspace",
        ) from err
    await session.refresh(project)

    return _project_to_schema(project, ProjectRole.ADMIN)


@router.get(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Get project",
)
async def get_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_reader),
) -> ProjectRead:
    """Get project details."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    return _project_to_schema(project, project_access.role)


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
    project_access: ProjectAccess = Depends(require_project_admin),
) -> ProjectRead:
    """Update a project."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    project.updated_at = datetime.now(UTC)
    try:
        await session.flush()
    except IntegrityError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project with this name already exists in the workspace",
        ) from err
    await session.refresh(project)
    return _project_to_schema(project, project_access.role)


@router.delete(
    "/{project_id}",
    summary="Delete project",
)
async def delete_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> dict[str, int | bool]:
    """Delete a project and return the number of scoped resources removed."""
    if not user.is_owner_for(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )

    project = await _get_project(project_id, session, workspace_id)
    if project.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The default project cannot be deleted",
        )

    resource_count = await _resource_count(session, project.id)
    await session.delete(project)
    await session.flush()
    return {"deleted": True, "resource_count": resource_count}


@router.post(
    "/{project_id}/set-default",
    response_model=ProjectRead,
    summary="Set project as workspace default",
)
async def set_default_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ProjectRead:
    """Set a project as the workspace default. Only workspace owners can do this."""
    if not user.is_owner_for(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )

    project = await _get_project(project_id, session, workspace_id)
    if project.is_default:
        return _project_to_schema(project, ProjectRole.ADMIN)

    # Unset the current default
    current_default = (
        await session.execute(
            select(ProjectModel).where(
                ProjectModel.workspace_id == workspace_id,
                ProjectModel.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()
    if current_default is not None:
        current_default.is_default = False

    project.is_default = True
    project.updated_at = datetime.now(UTC)
    await session.flush()
    await session.refresh(project)
    return _project_to_schema(project, ProjectRole.ADMIN)


@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberRead],
    summary="List project members",
)
async def list_project_members(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_admin),
) -> list[ProjectMemberRead]:
    """List members of a project."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    rows = (
        await session.execute(
            select(ProjectMembershipModel, UserModel)
            .join(UserModel, UserModel.id == ProjectMembershipModel.user_id)
            .where(ProjectMembershipModel.project_id == project.id)
            .order_by(ProjectMembershipModel.created_at.asc())
        )
    ).all()
    return [
        ProjectMemberRead(
            id=str(membership.id),
            user_id=str(membership.user_id),
            email=user_model.email,
            name=user_model.name,
            picture_url=user_model.picture_url,
            role=ProjectRole(membership.role),
            created_at=membership.created_at,
        )
        for membership, user_model in rows
    ]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add project member",
)
async def add_project_member(
    project_id: str,
    request: ProjectMemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_admin),
) -> ProjectMemberRead:
    """Add an existing workspace member to a project."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    if not _can_assign_project_role(user, project.workspace_id, request.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot assign that project role",
        )

    target_user = (
        await session.execute(select(UserModel).where(UserModel.email == request.email))
    ).scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    workspace_membership = (
        await session.execute(
            select(MembershipModel).where(
                MembershipModel.workspace_id == project.workspace_id,
                MembershipModel.user_id == target_user.id,
            )
        )
    ).scalar_one_or_none()
    if workspace_membership is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must be a workspace member before joining a project",
        )

    existing_membership = (
        await session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.project_id == project.id,
                ProjectMembershipModel.user_id == target_user.id,
            )
        )
    ).scalar_one_or_none()
    if existing_membership is not None:
        existing_membership.role = request.role.value
        membership = existing_membership
    else:
        membership = ProjectMembershipModel(
            id=uuid4(),
            project_id=project.id,
            user_id=target_user.id,
            role=request.role.value,
        )
        session.add(membership)
    await session.flush()
    await session.refresh(membership)

    return ProjectMemberRead(
        id=str(membership.id),
        user_id=str(target_user.id),
        email=target_user.email,
        name=target_user.name,
        picture_url=target_user.picture_url,
        role=ProjectRole(membership.role),
        created_at=membership.created_at,
    )


@router.patch(
    "/{project_id}/members/{membership_id}",
    response_model=ProjectMemberRead,
    summary="Update project member",
)
async def patch_project_member(
    project_id: str,
    membership_id: str,
    request: ProjectMemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_admin),
) -> ProjectMemberRead:
    """Update a project membership role."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    if not _can_assign_project_role(user, project.workspace_id, request.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot assign that project role",
        )

    membership_uuid = _parse_uuid(membership_id, "membership")
    membership = (
        await session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.id == membership_uuid,
                ProjectMembershipModel.project_id == project.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )

    membership.role = request.role.value
    await session.flush()
    target_user = await session.get(UserModel, membership.user_id)
    return ProjectMemberRead(
        id=str(membership.id),
        user_id=str(membership.user_id),
        email=target_user.email if target_user else "",
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        role=ProjectRole(membership.role),
        created_at=membership.created_at,
    )


@router.delete(
    "/{project_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Remove project member",
)
async def delete_project_member(
    project_id: str,
    membership_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_admin),
) -> None:
    """Remove a member from a project."""
    project = await _get_project(project_id, session, project_access.workspace_id)
    membership_uuid = _parse_uuid(membership_id, "membership")
    membership = (
        await session.execute(
            select(ProjectMembershipModel).where(
                ProjectMembershipModel.id == membership_uuid,
                ProjectMembershipModel.project_id == project.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project membership not found",
        )
    await session.delete(membership)
    await session.flush()
