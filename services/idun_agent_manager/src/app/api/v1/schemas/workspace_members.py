"""Schemas for workspace member management."""

from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class WorkspaceRole(str, enum.Enum):
    """Workspace membership roles, ordered by privilege level."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


ROLE_HIERARCHY: dict[WorkspaceRole, int] = {
    WorkspaceRole.OWNER: 4,
    WorkspaceRole.ADMIN: 3,
    WorkspaceRole.MEMBER: 2,
    WorkspaceRole.VIEWER: 1,
}


class MemberRead(BaseModel):
    """A workspace member with user details."""

    id: str
    user_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
    role: WorkspaceRole
    created_at: datetime
    status: str = "active"

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    """Request body to add a user to a workspace."""

    email: EmailStr
    role: WorkspaceRole = Field(
        default=WorkspaceRole.MEMBER,
        description="Role to assign. Owners can assign any role; admins can assign member or viewer.",
    )


class MemberPatch(BaseModel):
    """Request body to update a member's role."""

    role: WorkspaceRole


class InvitationRead(BaseModel):
    """A pending workspace invitation."""

    id: str
    email: str
    role: WorkspaceRole
    invited_by: str | None = None
    created_at: datetime
    status: str = "pending"

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    """Paginated list of workspace members and pending invitations."""

    members: list[MemberRead]
    invitations: list[InvitationRead] = []
    total: int
