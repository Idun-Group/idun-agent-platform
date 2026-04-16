"""Schemas for workspace member management."""

from __future__ import annotations

from datetime import datetime

from idun_agent_schema.manager.project import ProjectAssignment
from pydantic import BaseModel, EmailStr, Field


class MemberRead(BaseModel):
    """A workspace member with user details."""

    id: str
    user_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
    is_owner: bool = False
    created_at: datetime
    status: str = "active"

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    """Request body to add a user to a workspace."""

    email: EmailStr
    is_owner: bool = Field(default=False)
    project_assignments: list[ProjectAssignment] = Field(default_factory=list)


class MemberPatch(BaseModel):
    """Request body to update a member's workspace ownership."""

    is_owner: bool


class InvitationRead(BaseModel):
    """A pending workspace invitation."""

    id: str
    email: str
    is_owner: bool = False
    project_assignments: list[ProjectAssignment] = Field(default_factory=list)
    invited_by: str | None = None
    created_at: datetime
    status: str = "pending"

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    """Paginated list of workspace members and pending invitations."""

    members: list[MemberRead]
    invitations: list[InvitationRead] = []
    total: int
