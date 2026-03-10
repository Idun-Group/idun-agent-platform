"""Schemas for workspace and project member management."""

from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ProjectRole(str, enum.Enum):
    """Project membership roles, ordered by privilege level."""

    ADMIN = "admin"
    CONTRIBUTOR = "contributor"
    READER = "reader"


PROJECT_ROLE_HIERARCHY: dict[ProjectRole, int] = {
    ProjectRole.ADMIN: 3,
    ProjectRole.CONTRIBUTOR: 2,
    ProjectRole.READER: 1,
}


class MemberRead(BaseModel):
    """A workspace member with user details."""

    id: str
    user_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
    is_owner: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    """Request body to invite a user to a workspace."""

    email: EmailStr
    is_owner: bool = Field(
        default=False,
        description="Whether to grant workspace owner privileges.",
    )
    project_assignments: list[ProjectAssignment] = Field(
        default_factory=list,
        description="Pre-assigned project roles for the invitee.",
    )


class ProjectAssignment(BaseModel):
    """A project + role assignment for invitations."""

    project_id: str
    role: ProjectRole


class InvitationRead(BaseModel):
    """A pending workspace invitation."""

    id: str
    email: str
    is_owner: bool
    invited_by: str | None = None
    created_at: datetime
    project_assignments: list[InvitationProjectRead] = []

    model_config = {"from_attributes": True}


class InvitationProjectRead(BaseModel):
    """A project assignment on an invitation."""

    project_id: str
    role: ProjectRole


class MemberListResponse(BaseModel):
    """Paginated list of workspace members and pending invitations."""

    members: list[MemberRead]
    invitations: list[InvitationRead] = []
    total: int


class MemberPatch(BaseModel):
    """Request body to promote/demote a workspace member."""

    is_owner: bool


class ProjectMemberRead(BaseModel):
    """A project member with user details."""

    id: str
    user_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
    role: ProjectRole
    is_workspace_owner: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectMemberAdd(BaseModel):
    """Request body to add a user to a project."""

    user_id: str
    role: ProjectRole = Field(
        default=ProjectRole.READER,
        description="Role to assign. Project admins can assign contributor/reader. Only workspace owners can assign admin.",
    )


class ProjectMemberPatch(BaseModel):
    """Request body to update a project member's role."""

    role: ProjectRole


class ProjectMemberListResponse(BaseModel):
    """List of project members."""

    members: list[ProjectMemberRead]
    total: int
