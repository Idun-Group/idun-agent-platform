"""Pydantic schemas for Agent Manager API I/O."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ApiKeyResponse(BaseModel):
    """Response shape for a single agent resource."""

    api_key: str

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True
