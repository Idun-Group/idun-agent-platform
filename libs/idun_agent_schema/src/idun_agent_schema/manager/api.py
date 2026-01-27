"""Pydantic schemas for Agent Manager API I/O."""


from pydantic import BaseModel


class ApiKeyResponse(BaseModel):
    """Response shape for a single agent resource."""

    api_key: str

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True
