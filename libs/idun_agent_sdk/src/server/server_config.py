from pydantic import BaseModel, Field
from typing import Dict, Any

class ServerAPIConfig(BaseModel):
    port: int = 8000

class ServerConfig(BaseModel):
    """Configuration for the SDK's universal settings."""
    api: ServerAPIConfig = Field(default_factory=ServerAPIConfig)