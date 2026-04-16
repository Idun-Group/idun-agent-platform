"""Project and project membership schemas for the manager API."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ProjectRole(str, enum.Enum):
    """Project-level RBAC roles."""

    ADMIN = "admin"
    CONTRIBUTOR = "contributor"
    READER = "reader"


class ProjectCreate(BaseModel):
    """Create a project within a workspace."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class ProjectPatch(BaseModel):
    """Update a project."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class ProjectRead(BaseModel):
    """Project response schema."""

    id: UUID
    workspace_id: UUID
    name: str
    description: str | None = None
    is_default: bool = False
    current_user_role: ProjectRole | None = None
    created_at: datetime
    updated_at: datetime


class ProjectAssignment(BaseModel):
    """Workspace invite/member project assignment."""

    project_id: UUID
    role: ProjectRole = ProjectRole.READER


class ProjectMemberRead(BaseModel):
    """Project member response."""

    id: str
    user_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
    role: ProjectRole
    created_at: datetime


class ProjectMemberAdd(BaseModel):
    """Add or invite a member to a project."""

    email: EmailStr
    role: ProjectRole = ProjectRole.READER


class ProjectMemberPatch(BaseModel):
    """Update a project member role."""

    role: ProjectRole
