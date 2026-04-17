"""Workspace members API for workspace ownership and project assignments."""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.manager.project import ProjectAssignment, ProjectRole
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, get_current_user, get_session
from app.api.v1.schemas.workspace_members import (
    InvitationRead,
    MemberAdd,
    MemberListResponse,
    MemberPatch,
    MemberRead,
)
from app.infrastructure.db.models.invitation import InvitationModel
from app.infrastructure.db.models.invitation_project import InvitationProjectModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.project import ProjectModel
from app.infrastructure.db.models.project_membership import ProjectMembershipModel
from app.infrastructure.db.models.user import UserModel

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/{workspace_id}/members",
    response_model=MemberListResponse,
    summary="List workspace members",
)
async def list_members(
    workspace_id: str,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberListResponse:
    """Return all members of a workspace with user details."""
    ws_uuid = _parse_uuid(workspace_id)
    await _require_workspace_member(ws_uuid, user, session)

    total = await session.scalar(
        select(func.count())
        .select_from(MembershipModel)
        .where(MembershipModel.workspace_id == ws_uuid)
    )
    total = total or 0

    member_rows = (
        await session.execute(
            select(MembershipModel, UserModel)
            .join(UserModel, UserModel.id == MembershipModel.user_id)
            .where(MembershipModel.workspace_id == ws_uuid)
            .order_by(MembershipModel.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    members = [
        MemberRead(
            id=str(mem.id),
            user_id=str(mem.user_id),
            email=usr.email,
            name=usr.name,
            picture_url=usr.picture_url,
            is_owner=mem.is_owner,
            created_at=mem.created_at,
        )
        for mem, usr in member_rows
    ]

    invitations = (
        await session.execute(
            select(InvitationModel)
            .where(InvitationModel.workspace_id == ws_uuid)
            .order_by(InvitationModel.created_at.asc())
        )
    ).scalars().all()
    invitation_assignments = await _load_invitation_assignments(
        session, [inv.id for inv in invitations]
    )

    invitation_reads = [
        InvitationRead(
            id=str(inv.id),
            email=inv.email,
            is_owner=inv.is_owner,
            project_assignments=invitation_assignments.get(inv.id, []),
            invited_by=str(inv.invited_by) if inv.invited_by else None,
            created_at=inv.created_at,
        )
        for inv in invitations
    ]

    return MemberListResponse(
        members=members,
        invitations=invitation_reads,
        total=total,
    )


@router.post(
    "/{workspace_id}/members",
    response_model=MemberRead | InvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to the workspace or create a pending invitation",
)
async def add_member(
    workspace_id: str,
    body: MemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead | InvitationRead:
    """Add an existing user or create a pending invitation by email."""
    ws_uuid = _parse_uuid(workspace_id)
    await _require_workspace_owner(ws_uuid, user, session)

    target_user = (
        await session.execute(select(UserModel).where(UserModel.email == body.email))
    ).scalar_one_or_none()

    if target_user is not None:
        existing_membership = (
            await session.execute(
                select(MembershipModel).where(
                    MembershipModel.user_id == target_user.id,
                    MembershipModel.workspace_id == ws_uuid,
                )
            )
        ).scalar_one_or_none()
        if existing_membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        membership = MembershipModel(
            id=uuid4(),
            user_id=target_user.id,
            workspace_id=ws_uuid,
            is_owner=body.is_owner,
        )
        session.add(membership)
        await session.flush()

        assignments = await _normalize_project_assignments(
            session,
            workspace_id=ws_uuid,
            is_owner=body.is_owner,
            project_assignments=body.project_assignments,
        )
        await _apply_project_memberships(
            session,
            user_id=target_user.id,
            workspace_id=ws_uuid,
            is_owner=body.is_owner,
            assignments=assignments,
        )

        return MemberRead(
            id=str(membership.id),
            user_id=str(target_user.id),
            email=target_user.email,
            name=target_user.name,
            picture_url=target_user.picture_url,
            is_owner=membership.is_owner,
            created_at=membership.created_at,
        )

    duplicate_invitation = (
        await session.execute(
            select(InvitationModel).where(
                InvitationModel.email == body.email,
                InvitationModel.workspace_id == ws_uuid,
            )
        )
    ).scalar_one_or_none()
    if duplicate_invitation is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email has already been invited to this workspace",
        )

    invitation = InvitationModel(
        id=uuid4(),
        workspace_id=ws_uuid,
        email=body.email,
        is_owner=body.is_owner,
        invited_by=user.user_uuid,
    )
    session.add(invitation)
    await session.flush()

    assignments = await _normalize_project_assignments(
        session,
        workspace_id=ws_uuid,
        is_owner=body.is_owner,
        project_assignments=body.project_assignments,
    )
    for assignment in assignments:
        session.add(
            InvitationProjectModel(
                id=uuid4(),
                invitation_id=invitation.id,
                project_id=assignment.project_id,
                role=assignment.role.value,
            )
        )
    await session.flush()

    return InvitationRead(
        id=str(invitation.id),
        email=invitation.email,
        is_owner=invitation.is_owner,
        project_assignments=assignments,
        invited_by=str(invitation.invited_by) if invitation.invited_by else None,
        created_at=invitation.created_at,
    )


@router.patch(
    "/{workspace_id}/members/{membership_id}",
    response_model=MemberRead,
    summary="Update a member's workspace ownership",
)
async def update_member_role(
    workspace_id: str,
    membership_id: str,
    body: MemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Change a workspace member's ownership flag."""
    ws_uuid = _parse_uuid(workspace_id)
    mem_uuid = _parse_uuid(membership_id, "membership")
    await _require_workspace_owner(ws_uuid, user, session)

    target = await _get_membership(session, mem_uuid, ws_uuid)
    target_user = await session.get(UserModel, target.user_id)
    if target is None or target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )

    if target.is_owner and not body.is_owner:
        await _ensure_not_last_owner(session, ws_uuid)

    was_owner = target.is_owner
    target.is_owner = body.is_owner

    if body.is_owner and not was_owner:
        assignments = await _normalize_project_assignments(
            session,
            workspace_id=ws_uuid,
            is_owner=True,
            project_assignments=[],
        )
        await _apply_project_memberships(
            session,
            user_id=target.user_id,
            workspace_id=ws_uuid,
            is_owner=True,
            assignments=assignments,
        )
    elif not body.is_owner and was_owner:
        await _downgrade_owner_project_memberships(
            session, target.user_id, ws_uuid
        )

    await _bump_session_version(session, target.user_id)
    await session.flush()
    await session.refresh(target)

    return MemberRead(
        id=str(target.id),
        user_id=str(target.user_id),
        email=target_user.email,
        name=target_user.name,
        picture_url=target_user.picture_url,
        is_owner=target.is_owner,
        created_at=target.created_at,
    )


@router.delete(
    "/{workspace_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Remove a member from the workspace",
)
async def remove_member(
    workspace_id: str,
    membership_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Remove a member from the workspace."""
    ws_uuid = _parse_uuid(workspace_id)
    mem_uuid = _parse_uuid(membership_id, "membership")

    target = await _get_membership(session, mem_uuid, ws_uuid)
    is_self = target.user_id == user.user_uuid
    if not is_self:
        await _require_workspace_owner(ws_uuid, user, session)
    else:
        await _require_workspace_member(ws_uuid, user, session)

    if target.is_owner:
        await _ensure_not_last_owner(session, ws_uuid)

    await _delete_project_memberships_for_workspace(session, target.user_id, ws_uuid)
    await session.delete(target)
    await _bump_session_version(session, target.user_id)
    await session.flush()

    # Clear default_workspace_id if it pointed at the workspace we just removed
    # access to. Keep it simple: null-and-done — the user re-establishes a
    # default the next time they visit any remaining workspace.
    target_user = (
        await session.execute(select(UserModel).where(UserModel.id == target.user_id))
    ).scalar_one()
    if target_user.default_workspace_id == ws_uuid:
        target_user.default_workspace_id = None
        session.add(target_user)
        await session.flush()


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Cancel a pending invitation",
)
async def cancel_invitation(
    workspace_id: str,
    invitation_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Cancel a pending workspace invitation."""
    ws_uuid = _parse_uuid(workspace_id)
    inv_uuid = _parse_uuid(invitation_id, "invitation")
    await _require_workspace_owner(ws_uuid, user, session)

    invitation = (
        await session.execute(
            select(InvitationModel).where(
                InvitationModel.id == inv_uuid,
                InvitationModel.workspace_id == ws_uuid,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    await session.delete(invitation)
    await session.flush()


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/accept",
    response_model=MemberRead,
    summary="Accept a pending workspace invitation",
)
async def accept_invitation(
    workspace_id: str,
    invitation_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Accept a pending invitation for the current authenticated user."""
    ws_uuid = _parse_uuid(workspace_id)
    inv_uuid = _parse_uuid(invitation_id, "invitation")

    invitation = (
        await session.execute(
            select(InvitationModel).where(
                InvitationModel.id == inv_uuid,
                InvitationModel.workspace_id == ws_uuid,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )
    if invitation.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invitation email does not match the current user",
        )

    existing_membership = (
        await session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == user.user_uuid,
                MembershipModel.workspace_id == ws_uuid,
            )
        )
    ).scalar_one_or_none()
    if existing_membership is None:
        membership = MembershipModel(
            id=uuid4(),
            user_id=user.user_uuid,
            workspace_id=ws_uuid,
            is_owner=invitation.is_owner,
        )
        session.add(membership)
        await session.flush()
    else:
        membership = existing_membership
        membership.is_owner = membership.is_owner or invitation.is_owner

    assignments = (
        await session.execute(
            select(InvitationProjectModel).where(
                InvitationProjectModel.invitation_id == invitation.id
            )
        )
    ).scalars().all()
    assignment_payloads = [
        ProjectAssignment(
            project_id=assignment.project_id,
            role=ProjectRole(assignment.role),
        )
        for assignment in assignments
    ]
    normalized_assignments = await _normalize_project_assignments(
        session,
        workspace_id=ws_uuid,
        is_owner=membership.is_owner,
        project_assignments=assignment_payloads,
    )
    await _apply_project_memberships(
        session,
        user_id=user.user_uuid,
        workspace_id=ws_uuid,
        is_owner=membership.is_owner,
        assignments=normalized_assignments,
    )

    await session.delete(invitation)
    await _bump_session_version(session, user.user_uuid)
    await session.flush()

    target_user = await session.get(UserModel, user.user_uuid)
    return MemberRead(
        id=str(membership.id),
        user_id=str(membership.user_id),
        email=user.email,
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        is_owner=membership.is_owner,
        created_at=membership.created_at,
    )


def _parse_uuid(value: str, label: str = "workspace") -> UUID:
    try:
        return UUID(value)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label} id",
        ) from err


async def _require_workspace_member(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
) -> MembershipModel:
    membership = (
        await session.execute(
            select(MembershipModel).where(
                MembershipModel.user_id == user.user_uuid,
                MembershipModel.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    return membership


async def _require_workspace_owner(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
) -> MembershipModel:
    membership = await _require_workspace_member(workspace_id, user, session)
    if not membership.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace owner access required",
        )
    return membership


async def _get_membership(
    session: AsyncSession, membership_id: UUID, workspace_id: UUID
) -> MembershipModel:
    membership = (
        await session.execute(
            select(MembershipModel).where(
                MembershipModel.id == membership_id,
                MembershipModel.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )
    return membership


async def _ensure_not_last_owner(session: AsyncSession, workspace_id: UUID) -> None:
    owner_count = await session.scalar(
        select(func.count())
        .select_from(MembershipModel)
        .where(
            MembershipModel.workspace_id == workspace_id,
            MembershipModel.is_owner.is_(True),
        )
    )
    if (owner_count or 0) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove or demote the last owner of the workspace",
        )


async def _load_workspace_projects(
    session: AsyncSession, workspace_id: UUID
) -> list[ProjectModel]:
    return (
        await session.execute(
            select(ProjectModel).where(ProjectModel.workspace_id == workspace_id)
        )
    ).scalars().all()


async def _normalize_project_assignments(
    session: AsyncSession,
    workspace_id: UUID,
    is_owner: bool,
    project_assignments: list[ProjectAssignment],
) -> list[ProjectAssignment]:
    projects = await _load_workspace_projects(session, workspace_id)
    if not projects:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace has no projects",
        )

    if is_owner:
        return [
            ProjectAssignment(project_id=project.id, role=ProjectRole.ADMIN)
            for project in projects
        ]

    if not project_assignments:
        default_project = next((project for project in projects if project.is_default), None)
        if default_project is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace default project not found",
            )
        return [
            ProjectAssignment(
                project_id=default_project.id,
                role=ProjectRole.READER,
            )
        ]

    project_map = {project.id: project for project in projects}
    normalized: dict[UUID, ProjectAssignment] = {}
    for assignment in project_assignments:
        if assignment.project_id not in project_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project assignment does not belong to this workspace",
            )
        normalized[assignment.project_id] = assignment
    return list(normalized.values())


async def _apply_project_memberships(
    session: AsyncSession,
    user_id: UUID,
    workspace_id: UUID,
    is_owner: bool,
    assignments: list[ProjectAssignment],
) -> None:
    assignment_map = {assignment.project_id: assignment.role.value for assignment in assignments}
    existing_rows = (
        await session.execute(
            select(ProjectMembershipModel, ProjectModel)
            .join(ProjectModel, ProjectModel.id == ProjectMembershipModel.project_id)
            .where(
                ProjectMembershipModel.user_id == user_id,
                ProjectModel.workspace_id == workspace_id,
            )
        )
    ).all()
    existing_by_project = {
        project.id: membership for membership, project in existing_rows
    }

    for project_id, role in assignment_map.items():
        existing = existing_by_project.get(project_id)
        if existing is None:
            session.add(
                ProjectMembershipModel(
                    id=uuid4(),
                    project_id=project_id,
                    user_id=user_id,
                    role=role,
                )
            )
        else:
            existing.role = role

    if is_owner:
        projects = await _load_workspace_projects(session, workspace_id)
        for project in projects:
            existing = existing_by_project.get(project.id)
            if existing is None:
                session.add(
                    ProjectMembershipModel(
                        id=uuid4(),
                        project_id=project.id,
                        user_id=user_id,
                        role=ProjectRole.ADMIN.value,
                    )
                )
            else:
                existing.role = ProjectRole.ADMIN.value


async def _delete_project_memberships_for_workspace(
    session: AsyncSession, user_id: UUID, workspace_id: UUID
) -> None:
    project_ids = (
        await session.execute(
            select(ProjectModel.id).where(ProjectModel.workspace_id == workspace_id)
        )
    ).scalars().all()
    if not project_ids:
        return
    await session.execute(
        delete(ProjectMembershipModel).where(
            ProjectMembershipModel.user_id == user_id,
            ProjectMembershipModel.project_id.in_(project_ids),
        )
    )


async def _downgrade_owner_project_memberships(
    session: AsyncSession, user_id: UUID, workspace_id: UUID
) -> None:
    project_rows = (
        await session.execute(
            select(ProjectMembershipModel, ProjectModel)
            .join(ProjectModel, ProjectModel.id == ProjectMembershipModel.project_id)
            .where(
                ProjectMembershipModel.user_id == user_id,
                ProjectModel.workspace_id == workspace_id,
            )
        )
    ).all()

    saw_membership = False
    default_membership: ProjectMembershipModel | None = None
    default_project_id: UUID | None = None
    for membership, project in project_rows:
        saw_membership = True
        if project.is_default:
            default_membership = membership
            default_project_id = project.id
        if membership.role == ProjectRole.ADMIN.value:
            membership.role = ProjectRole.READER.value

    if not saw_membership:
        default_project = (
            await session.execute(
                select(ProjectModel).where(
                    ProjectModel.workspace_id == workspace_id,
                    ProjectModel.is_default.is_(True),
                )
            )
        ).scalar_one_or_none()
        default_project_id = default_project.id if default_project else None

    if default_membership is None and default_project_id is not None:
        session.add(
            ProjectMembershipModel(
                id=uuid4(),
                project_id=default_project_id,
                user_id=user_id,
                role=ProjectRole.READER.value,
            )
        )


async def _load_invitation_assignments(
    session: AsyncSession, invitation_ids: list[UUID]
) -> dict[UUID, list[ProjectAssignment]]:
    if not invitation_ids:
        return {}

    rows = (
        await session.execute(
            select(InvitationProjectModel).where(
                InvitationProjectModel.invitation_id.in_(invitation_ids)
            )
        )
    ).scalars().all()

    assignments: dict[UUID, list[ProjectAssignment]] = {invitation_id: [] for invitation_id in invitation_ids}
    for row in rows:
        assignments.setdefault(row.invitation_id, []).append(
            ProjectAssignment(
                project_id=row.project_id,
                role=ProjectRole(row.role),
            )
        )
    return assignments


async def _bump_session_version(session: AsyncSession, user_id: UUID) -> None:
    user = await session.get(UserModel, user_id)
    if user is not None:
        user.session_version += 1
