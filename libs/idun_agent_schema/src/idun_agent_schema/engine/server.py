"""Server configuration models (engine)."""

from pydantic import BaseModel, Field


class ServerAPIConfig(BaseModel):
    """API server configuration."""

    port: int = 8000


class ServerConfig(BaseModel):
    """Configuration for the Engine's universal settings."""

    api: ServerAPIConfig = Field(default_factory=ServerAPIConfig)
