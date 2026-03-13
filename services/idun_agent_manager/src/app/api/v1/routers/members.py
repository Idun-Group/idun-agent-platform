"""Workspace members API.

Endpoints for managing workspace-level members and pending invitations.
Only workspace owners can invite, remove, or cancel invitations.
Any workspace member can list members.
"""

import logging
from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, get_current_user, get_session
from app.api.v1.schemas.workspace_members import (
    InvitationProjectRead,
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


async def _require_workspace_member(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
) -> MembershipModel:
    """Verify the current user is a member of the workspace (any role).

    Returns the MembershipModel on success.
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


async def _ensure_not_last_owner(
    workspace_id: UUID,
    membership_id: UUID,
    session: AsyncSession,
) -> None:
    """Raise 400 if removing the membership would leave no owners."""
    target = await session.get(MembershipModel, membership_id)
    if target is None:
        return  # Will be handled by the caller

    if not target.is_owner:
        return  # Not an owner, safe to remove

    owner_count_stmt = (
        select(func.count())
        .select_from(MembershipModel)
        .where(
            MembershipModel.workspace_id == workspace_id,
            MembershipModel.is_owner.is_(True),
        )
    )
    owner_count = (await session.execute(owner_count_stmt)).scalar_one()
    if owner_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last workspace owner",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{workspace_id}/members",
    response_model=MemberListResponse,
    summary="List workspace members and pending invitations",
)
async def list_members(
    workspace_id: UUID,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberListResponse:
    """Return all members of the workspace and any pending invitations.

    Any workspace member can call this endpoint.
    """
    await _require_workspace_member(workspace_id, user, session)

    # Fetch members with user details
    members_stmt = (
        select(MembershipModel, UserModel)
        .join(UserModel, UserModel.id == MembershipModel.user_id)
        .where(MembershipModel.workspace_id == workspace_id)
        .order_by(MembershipModel.created_at)
        .limit(limit)
        .offset(offset)
    )
    members_result = await session.execute(members_stmt)
    member_rows = members_result.all()

    members = [
        MemberRead(
            id=str(membership.id),
            user_id=str(membership.user_id),
            email=usr.email,
            name=usr.name,
            picture_url=usr.picture_url,
            is_owner=membership.is_owner,
            created_at=membership.created_at,
        )
        for membership, usr in member_rows
    ]

    # Fetch pending invitations with project assignments in one query (no N+1)
    inv_stmt = (
        select(InvitationModel, InvitationProjectModel)
        .outerjoin(
            InvitationProjectModel,
            InvitationProjectModel.invitation_id == InvitationModel.id,
        )
        .where(
            InvitationModel.workspace_id == workspace_id,
            InvitationModel.consumed_at.is_(None),
        )
        .order_by(InvitationModel.created_at)
    )
    inv_result = await session.execute(inv_stmt)
    inv_rows = inv_result.all()

    # Group invitation_projects by invitation
    inv_map: dict[UUID, InvitationModel] = {}
    ip_map: dict[UUID, list[InvitationProjectRead]] = defaultdict(list)
    for inv, ip in inv_rows:
        inv_map[inv.id] = inv
        if ip is not None:
            ip_map[inv.id].append(
                InvitationProjectRead(
                    project_id=str(ip.project_id),
                    role=ip.role,
                )
            )

    invitations = [
        InvitationRead(
            id=str(inv.id),
            email=inv.email,
            is_owner=inv.is_owner,
            invited_by=str(inv.invited_by) if inv.invited_by else None,
            created_at=inv.created_at,
            project_assignments=ip_map.get(inv.id, []),
        )
        for inv in inv_map.values()
    ]

    # Total count of members (not paginated)
    total_stmt = (
        select(func.count())
        .select_from(MembershipModel)
        .where(MembershipModel.workspace_id == workspace_id)
    )
    total = (await session.execute(total_stmt)).scalar_one()

    return MemberListResponse(
        members=members,
        invitations=invitations,
        total=total,
    )


@router.post(
    "/{workspace_id}/members",
    response_model=MemberRead | InvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to the workspace",
)
async def add_member(
    workspace_id: UUID,
    request: MemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead | InvitationRead:
    """Invite a user to the workspace by email.

    If the user already exists in the system, a MembershipModel is created
    directly and the user gains immediate access.  Otherwise, an invitation
    is created and project assignments are stored for later materialisation.

    Owners have implicit admin on all projects (no project_membership rows
    are created). Non-owners only get access to projects they are explicitly
    assigned to via ``project_assignments``.

    Only workspace owners can invite new members.
    """
    await _require_workspace_owner(workspace_id, user, session)

    email = request.email.lower()

    # Check for duplicate invitation
    dup_inv_stmt = select(InvitationModel).where(
        InvitationModel.workspace_id == workspace_id,
        InvitationModel.email == email,
        InvitationModel.consumed_at.is_(None),
    )
    if (await session.execute(dup_inv_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invitation for this email already exists",
        )

    # Check if the user already exists in the system
    user_stmt = select(UserModel).where(UserModel.email == email)
    existing_user = (await session.execute(user_stmt)).scalar_one_or_none()

    if existing_user is not None:
        # Check for duplicate membership
        dup_mem_stmt = select(MembershipModel).where(
            MembershipModel.user_id == existing_user.id,
            MembershipModel.workspace_id == workspace_id,
        )
        if (await session.execute(dup_mem_stmt)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        # Create membership directly
        membership = MembershipModel(
            id=uuid4(),
            user_id=existing_user.id,
            workspace_id=workspace_id,
            is_owner=request.is_owner,
        )
        session.add(membership)
        await session.flush()

        # Create project memberships for explicit assignments (non-owners only)
        if not request.is_owner:
            for assignment in request.project_assignments:
                project_id = UUID(assignment.project_id)

                # Validate project belongs to workspace
                project = await session.get(ProjectModel, project_id)
                if project is None or project.workspace_id != workspace_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Project {assignment.project_id} not found in workspace",
                    )

                pm = ProjectMembershipModel(
                    id=uuid4(),
                    project_id=project_id,
                    user_id=existing_user.id,
                    role=assignment.role.value,
                )
                session.add(pm)
        # Owners have implicit admin on all projects — no rows needed

        await session.flush()

        logger.info(
            "User %s added to workspace %s by %s",
            existing_user.id,
            workspace_id,
            user.user_id,
        )

        return MemberRead(
            id=str(membership.id),
            user_id=str(existing_user.id),
            email=existing_user.email,
            name=existing_user.name,
            picture_url=existing_user.picture_url,
            is_owner=membership.is_owner,
            created_at=membership.created_at,
        )

    # User does not exist yet -- create an invitation
    invitation_id = uuid4()
    invitation = InvitationModel(
        id=invitation_id,
        workspace_id=workspace_id,
        email=email,
        is_owner=request.is_owner,
        invited_by=UUID(user.user_id),
    )
    session.add(invitation)
    await session.flush()

    # Store project assignments on the invitation
    inv_project_reads: list[InvitationProjectRead] = []
    for assignment in request.project_assignments:
        project_id = UUID(assignment.project_id)

        # Validate project belongs to workspace
        project = await session.get(ProjectModel, project_id)
        if project is None or project.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project {assignment.project_id} not found in workspace",
            )

        ip = InvitationProjectModel(
            id=uuid4(),
            invitation_id=invitation_id,
            project_id=project_id,
            role=assignment.role.value,
        )
        session.add(ip)

        inv_project_reads.append(
            InvitationProjectRead(
                project_id=str(project_id),
                role=assignment.role,
            )
        )

    await session.flush()

    logger.info(
        "Invitation created for %s to workspace %s by %s",
        email,
        workspace_id,
        user.user_id,
    )

    return InvitationRead(
        id=str(invitation.id),
        email=invitation.email,
        is_owner=invitation.is_owner,
        invited_by=str(invitation.invited_by) if invitation.invited_by else None,
        created_at=invitation.created_at,
        project_assignments=inv_project_reads,
    )


@router.post(
    "/{workspace_id}/accept-invitation",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Accept a pending workspace invitation",
)
async def accept_invitation(
    workspace_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Accept a pending workspace invitation for the current user.

    Looks up the invitation by the authenticated user's email. Creates
    workspace membership and materialises project assignments from the
    invitation. Owners have implicit admin on all projects (no
    project_membership rows are created). Deletes the invitation on success.

    Idempotent: if the user is already a member, returns 409.
    """
    # Check the user is not already a member
    dup_stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    if (await session.execute(dup_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of this workspace",
        )

    # Find invitation for this user's email
    inv_stmt = select(InvitationModel).where(
        InvitationModel.workspace_id == workspace_id,
        InvitationModel.email == user.email.lower(),
        InvitationModel.consumed_at.is_(None),
    )
    invitation = (await session.execute(inv_stmt)).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending invitation found for your email in this workspace",
        )

    # Create workspace membership
    membership = MembershipModel(
        id=uuid4(),
        user_id=UUID(user.user_id),
        workspace_id=workspace_id,
        is_owner=invitation.is_owner,
    )
    session.add(membership)
    await session.flush()

    # Fetch invitation project assignments
    ip_stmt = select(InvitationProjectModel).where(
        InvitationProjectModel.invitation_id == invitation.id,
    )
    ip_rows = (await session.execute(ip_stmt)).scalars().all()

    # Materialise project memberships from invitation (non-owners only)
    if not invitation.is_owner:
        for ip in ip_rows:
            project = await session.get(ProjectModel, ip.project_id)
            if project is None or project.workspace_id != workspace_id:
                logger.warning(
                    "Skipping deleted project %s during invitation acceptance for %s",
                    ip.project_id,
                    user.email,
                )
                continue

            pm = ProjectMembershipModel(
                id=uuid4(),
                project_id=ip.project_id,
                user_id=UUID(user.user_id),
                role=ip.role,
            )
            session.add(pm)
    # Owners have implicit admin on all projects — no rows needed

    # Mark invitation as consumed (soft-delete for audit trail)
    invitation.consumed_at = datetime.now(UTC)
    await session.flush()

    # Fetch user for response
    user_model = await session.get(UserModel, UUID(user.user_id))

    logger.info(
        "User %s accepted invitation and joined workspace %s",
        user.user_id,
        workspace_id,
    )

    return MemberRead(
        id=str(membership.id),
        user_id=user.user_id,
        email=user_model.email if user_model else user.email,
        name=user_model.name if user_model else None,
        picture_url=user_model.picture_url if user_model else None,
        is_owner=membership.is_owner,
        created_at=membership.created_at,
    )


@router.delete(
    "/{workspace_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from the workspace",
)
async def remove_member(
    workspace_id: UUID,
    membership_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Remove a member from the workspace.

    Cannot remove the last owner.  When removing a member, their project
    memberships within the workspace are also deleted.

    Only workspace owners can remove members.
    """
    await _require_workspace_owner(workspace_id, user, session)
    await _ensure_not_last_owner(workspace_id, membership_id, session)

    target = await session.get(MembershipModel, membership_id)
    if target is None or target.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )

    # Delete project memberships for this user within the workspace
    project_ids_stmt = select(ProjectModel.id).where(
        ProjectModel.workspace_id == workspace_id,
    )
    del_pm_stmt = delete(ProjectMembershipModel).where(
        ProjectMembershipModel.user_id == target.user_id,
        ProjectMembershipModel.project_id.in_(project_ids_stmt),
    )
    await session.execute(del_pm_stmt)

    # Invalidate the removed user's session.
    removed_user = await session.get(UserModel, target.user_id)
    if removed_user is not None:
        removed_user.session_version += 1

    await session.delete(target)
    await session.flush()

    logger.info(
        "Member %s (user %s) removed from workspace %s by %s",
        membership_id,
        target.user_id,
        workspace_id,
        user.user_id,
    )


@router.patch(
    "/{workspace_id}/members/{membership_id}",
    response_model=MemberRead,
    summary="Promote or demote a workspace member",
)
async def update_member(
    workspace_id: UUID,
    membership_id: UUID,
    request: MemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Promote a member to owner or demote an owner to member.

    Only workspace owners can perform this action.
    Cannot demote the last owner.

    Promotion (member -> owner):
    - Deletes all project_memberships (now implicit admin on everything)
    - Increments session_version to invalidate active sessions

    Demotion (owner -> member):
    - Creates project_memberships as admin on all projects (preserves access)
    - Increments session_version to invalidate active sessions
    """
    await _require_workspace_owner(workspace_id, user, session)

    target = await session.get(MembershipModel, membership_id)
    if target is None or target.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )

    target_user = await session.get(UserModel, target.user_id)

    # No-op if already in desired state
    if target.is_owner == request.is_owner:
        return MemberRead(
            id=str(target.id),
            user_id=str(target.user_id),
            email=target_user.email if target_user else "",
            name=target_user.name if target_user else None,
            picture_url=target_user.picture_url if target_user else None,
            is_owner=target.is_owner,
            created_at=target.created_at,
        )

    if target.is_owner and not request.is_owner:
        # Demotion: check not last owner
        await _ensure_not_last_owner(workspace_id, membership_id, session)

        # Create project_memberships as admin on all projects (preserve access)
        all_projects_stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
        )
        all_projects = (await session.execute(all_projects_stmt)).scalars().all()
        for proj in all_projects:
            pm = ProjectMembershipModel(
                id=uuid4(),
                project_id=proj.id,
                user_id=target.user_id,
                role="admin",
            )
            session.add(pm)

    elif not target.is_owner and request.is_owner:
        # Promotion: delete all project_memberships (implicit admin now)
        project_ids_stmt = select(ProjectModel.id).where(
            ProjectModel.workspace_id == workspace_id,
        )
        del_pm_stmt = delete(ProjectMembershipModel).where(
            ProjectMembershipModel.user_id == target.user_id,
            ProjectMembershipModel.project_id.in_(project_ids_stmt),
        )
        await session.execute(del_pm_stmt)

    target.is_owner = request.is_owner

    # Invalidate session so user picks up new permissions
    if target_user is not None:
        target_user.session_version += 1

    await session.flush()

    logger.info(
        "Member %s (user %s) %s in workspace %s by %s",
        membership_id,
        target.user_id,
        "promoted to owner" if request.is_owner else "demoted to member",
        workspace_id,
        user.user_id,
    )

    return MemberRead(
        id=str(target.id),
        user_id=str(target.user_id),
        email=target_user.email if target_user else "",
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        is_owner=target.is_owner,
        created_at=target.created_at,
    )


@router.post(
    "/{workspace_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave a workspace (self-removal)",
)
async def leave_workspace(
    workspace_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Leave a workspace voluntarily.

    Non-owners can leave at any time. Sole owners cannot leave
    (must transfer ownership first). Deletes project memberships
    within the workspace and clears default_workspace_id if needed.
    """
    # Find the user's own membership
    result = await session.execute(
        select(MembershipModel).where(
            MembershipModel.workspace_id == workspace_id,
            MembershipModel.user_id == UUID(user.user_id),
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not a member of this workspace",
        )

    # Prevent sole owner from leaving
    await _ensure_not_last_owner(workspace_id, membership.id, session)

    # Delete project memberships for this user within the workspace
    await session.execute(
        delete(ProjectMembershipModel).where(
            ProjectMembershipModel.user_id == UUID(user.user_id),
            ProjectMembershipModel.project_id.in_(
                select(ProjectModel.id).where(
                    ProjectModel.workspace_id == workspace_id
                )
            ),
        )
    )

    # Delete the membership
    await session.delete(membership)

    # Clear default_workspace_id if it was this workspace
    user_model = await session.get(UserModel, UUID(user.user_id))
    if user_model and user_model.default_workspace_id == workspace_id:
        user_model.default_workspace_id = None

    # Increment session version to invalidate active sessions
    if user_model:
        user_model.session_version = (user_model.session_version or 0) + 1

    await session.flush()

    logger.info(
        "User %s left workspace %s",
        user.user_id,
        workspace_id,
    )


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel a pending invitation",
)
async def cancel_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Cancel a pending workspace invitation (soft-delete).

    Sets consumed_at to mark the invitation as no longer pending.
    Only workspace owners can cancel invitations.
    """
    await _require_workspace_owner(workspace_id, user, session)

    invitation = await session.get(InvitationModel, invitation_id)
    if (
        invitation is None
        or invitation.workspace_id != workspace_id
        or invitation.consumed_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    invitation.consumed_at = datetime.now(UTC)
    await session.flush()

    logger.info(
        "Invitation %s for %s cancelled in workspace %s by %s",
        invitation_id,
        invitation.email,
        workspace_id,
        user.user_id,
    )
