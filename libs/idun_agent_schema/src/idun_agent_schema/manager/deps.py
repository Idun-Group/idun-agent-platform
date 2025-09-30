"""Shared dependency models used by FastAPI deps in Manager."""

from uuid import UUID

from pydantic import BaseModel


class Principal(BaseModel):
    """Authenticated caller identity and authorization context."""

    user_id: str
    tenant_id: UUID
    roles: list[str] = []
    workspace_ids: list[UUID] = []
