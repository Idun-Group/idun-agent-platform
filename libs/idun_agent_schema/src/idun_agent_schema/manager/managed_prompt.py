"""Managed prompt schemas for the manager API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ManagedPromptCreate(BaseModel):
    """Request body for creating a new prompt version."""

    prompt_id: str = Field(..., description="Logical prompt identifier")
    content: str = Field(..., description="Prompt text, supports Jinja2 {{ variables }}")
    tags: list[str] = Field(default_factory=list, description="User-defined tags")


class ManagedPromptRead(BaseModel):
    """Response body for a prompt."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_id: str
    version: int
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class ManagedPromptPatch(BaseModel):
    """Request body for updating prompt tags. Content is immutable (append-only versioning)."""

    tags: list[str] = Field(..., description="Updated tags")
