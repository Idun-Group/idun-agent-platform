"""Pydantic schemas for Agent Manager API I/O."""

from pydantic import BaseModel, ConfigDict


class ApiKeyResponse(BaseModel):
    """Response shape for a single agent resource."""

    model_config = ConfigDict(from_attributes=True)

    api_key: str
