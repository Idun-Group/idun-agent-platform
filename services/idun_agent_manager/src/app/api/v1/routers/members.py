"""Workspace members API.

Endpoints for managing workspace membership: list, add, update role, remove.
"""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, get_current_user, get_session
from app.api.v1.schemas.workspace_members import (
    ROLE_HIERARCHY,
    InvitationRead,
    MemberAdd,
    MemberListResponse,
    MemberPatch,
    MemberRead,
    WorkspaceRole,
)
from app.infrastructure.db.models.invitation import InvitationModel
from app.infrastructure.db.models.membership import MembershipModel
from app.infrastructure.db.models.user import UserModel

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Reusable dependency
# ---------------------------------------------------------------------------


async def require_workspace_role(
    workspace_id: UUID,
    user: CurrentUser,
    session: AsyncSession,
    min_role: WorkspaceRole = WorkspaceRole.VIEWER,
) -> MembershipModel:
    """Verify the user has at least *min_role* in the workspace.

    Returns the membership row on success.
    Raises 404 if no membership, 403 if insufficient role.
    """
    stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    result = await session.execute(stmt)
    membership = result.scalar_one_or_none()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    user_level = ROLE_HIERARCHY.get(WorkspaceRole(membership.role), 0)
    required_level = ROLE_HIERARCHY[min_role]

    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {min_role.value} role",
        )

    return membership


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


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

    # Verify caller is a member (any role)
    await require_workspace_role(ws_uuid, user, session, WorkspaceRole.VIEWER)

    # Count total
    count_stmt = (
        select(func.count())
        .select_from(MembershipModel)
        .where(MembershipModel.workspace_id == ws_uuid)
    )
    total = (await session.execute(count_stmt)).scalar_one()

    # Fetch members joined with users
    stmt = (
        select(MembershipModel, UserModel)
        .join(UserModel, UserModel.id == MembershipModel.user_id)
        .where(MembershipModel.workspace_id == ws_uuid)
        .order_by(MembershipModel.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()

    members = [
        MemberRead(
            id=str(mem.id),
            user_id=str(mem.user_id),
            email=usr.email,
            name=usr.name,
            picture_url=usr.picture_url,
            role=WorkspaceRole(mem.role),
            created_at=mem.created_at,
        )
        for mem, usr in rows
    ]

    # Fetch pending invitations
    inv_stmt = (
        select(InvitationModel)
        .where(InvitationModel.workspace_id == ws_uuid)
        .order_by(InvitationModel.created_at.asc())
    )
    inv_rows = (await session.execute(inv_stmt)).scalars().all()

    invitations = [
        InvitationRead(
            id=str(inv.id),
            email=inv.email,
            role=WorkspaceRole(inv.role),
            invited_by=str(inv.invited_by) if inv.invited_by else None,
            created_at=inv.created_at,
        )
        for inv in inv_rows
    ]

    return MemberListResponse(members=members, invitations=invitations, total=total)


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

    caller = await require_workspace_role(
        ws_uuid, user, session, WorkspaceRole.ADMIN
    )
    _enforce_role_grant(caller, body.role)

    # Try to find user by email
    stmt = select(UserModel).where(UserModel.email == body.email)
    target_user = (await session.execute(stmt)).scalar_one_or_none()

    if target_user is not None:
        # User exists — check for duplicate membership
        dup_stmt = select(MembershipModel).where(
            MembershipModel.user_id == target_user.id,
            MembershipModel.workspace_id == ws_uuid,
        )
        if (await session.execute(dup_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        membership = MembershipModel(
            id=uuid4(),
            user_id=target_user.id,
            workspace_id=ws_uuid,
            role=body.role.value,
        )
        session.add(membership)
        await session.flush()
        await session.refresh(membership)

        return MemberRead(
            id=str(membership.id),
            user_id=str(target_user.id),
            email=target_user.email,
            name=target_user.name,
            picture_url=target_user.picture_url,
            role=WorkspaceRole(membership.role),
            created_at=membership.created_at,
        )
    else:
        # User doesn't exist — check for duplicate invitation
        dup_inv_stmt = select(InvitationModel).where(
            InvitationModel.email == body.email,
            InvitationModel.workspace_id == ws_uuid,
        )
        if (await session.execute(dup_inv_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email has already been invited to this workspace",
            )

        invitation = InvitationModel(
            id=uuid4(),
            workspace_id=ws_uuid,
            email=body.email,
            role=body.role.value,
            invited_by=UUID(user.user_id),
        )
        session.add(invitation)
        await session.flush()
        await session.refresh(invitation)

        return InvitationRead(
            id=str(invitation.id),
            email=invitation.email,
            role=WorkspaceRole(invitation.role),
            invited_by=str(invitation.invited_by),
            created_at=invitation.created_at,
        )


@router.patch(
    "/{workspace_id}/members/{membership_id}",
    response_model=MemberRead,
    summary="Update a member's role",
)
async def update_member_role(
    workspace_id: str,
    membership_id: str,
    body: MemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Change a workspace member's role."""
    ws_uuid = _parse_uuid(workspace_id)
    mem_uuid = _parse_uuid(membership_id, "membership")

    caller = await require_workspace_role(
        ws_uuid, user, session, WorkspaceRole.ADMIN
    )

    target = await _get_membership(session, mem_uuid, ws_uuid)
    target_user = await session.get(UserModel, target.user_id)

    # Cannot change the role of the last owner
    if (
        WorkspaceRole(target.role) == WorkspaceRole.OWNER
        and body.role != WorkspaceRole.OWNER
    ):
        await _ensure_not_last_owner(session, ws_uuid)

    _enforce_role_grant(caller, body.role)

    # Admin cannot change another admin's or owner's role
    caller_level = ROLE_HIERARCHY[WorkspaceRole(caller.role)]
    target_level = ROLE_HIERARCHY[WorkspaceRole(target.role)]
    if caller_level <= target_level and caller.id != target.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change the role of a member with equal or higher role",
        )

    target.role = body.role.value
    await session.flush()
    await session.refresh(target)

    return MemberRead(
        id=str(target.id),
        user_id=str(target.user_id),
        email=target_user.email if target_user else "",
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        role=WorkspaceRole(target.role),
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

    caller = await require_workspace_role(
        ws_uuid, user, session, WorkspaceRole.ADMIN
    )

    target = await _get_membership(session, mem_uuid, ws_uuid)

    # Self-removal is always allowed (except last owner)
    is_self = caller.id == target.id

    if not is_self:
        # Admin cannot remove owner or another admin
        caller_level = ROLE_HIERARCHY[WorkspaceRole(caller.role)]
        target_level = ROLE_HIERARCHY[WorkspaceRole(target.role)]
        if caller_level <= target_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot remove a member with equal or higher role",
            )

    # Cannot remove the last owner
    if WorkspaceRole(target.role) == WorkspaceRole.OWNER:
        await _ensure_not_last_owner(session, ws_uuid)

    await session.delete(target)
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

    await require_workspace_role(ws_uuid, user, session, WorkspaceRole.ADMIN)

    stmt = select(InvitationModel).where(
        InvitationModel.id == inv_uuid,
        InvitationModel.workspace_id == ws_uuid,
    )
    invitation = (await session.execute(stmt)).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    await session.delete(invitation)
    await session.flush()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_uuid(value: str, label: str = "workspace") -> UUID:
    try:
        return UUID(value)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label} id",
        ) from err


async def _get_user_by_email(session: AsyncSession, email: str) -> UserModel:
    stmt = select(UserModel).where(UserModel.email == email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user found with email {email}",
        )
    return user


async def _get_membership(
    session: AsyncSession, membership_id: UUID, workspace_id: UUID
) -> MembershipModel:
    stmt = select(MembershipModel).where(
        MembershipModel.id == membership_id,
        MembershipModel.workspace_id == workspace_id,
    )
    result = await session.execute(stmt)
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )
    return membership


async def _ensure_not_last_owner(
    session: AsyncSession, workspace_id: UUID
) -> None:
    count_stmt = (
        select(func.count())
        .select_from(MembershipModel)
        .where(
            MembershipModel.workspace_id == workspace_id,
            MembershipModel.role == WorkspaceRole.OWNER.value,
        )
    )
    owner_count = (await session.execute(count_stmt)).scalar_one()
    if owner_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove or demote the last owner of the workspace",
        )


def _enforce_role_grant(caller: MembershipModel, target_role: WorkspaceRole) -> None:
    """Ensure the caller is allowed to grant the target role.

    Owners can assign any role including owner.
    Admins can only assign roles below admin.
    """
    caller_role = WorkspaceRole(caller.role)
    caller_level = ROLE_HIERARCHY[caller_role]
    target_level = ROLE_HIERARCHY[target_role]

    # Owners can assign any role (including owner)
    if caller_role == WorkspaceRole.OWNER:
        return

    # Everyone else cannot assign equal or higher
    if target_level >= caller_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot assign role {target_role.value}; insufficient privileges",
        )
