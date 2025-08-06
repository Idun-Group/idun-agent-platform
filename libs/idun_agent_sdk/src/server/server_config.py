from pydantic import BaseModel, Field
from typing import Dict, Any

class AppAPIConfig(BaseModel):
    port: int = 8000

class AppTelemetryConfig(BaseModel):
    provider: str = "langfuse"

class SDKConfig(BaseModel):
    """Configuration for the SDK's universal settings."""
    api: AppAPIConfig = Field(default_factory=AppAPIConfig)
    telemetry: AppTelemetryConfig = Field(default_factory=AppTelemetryConfig)

class AgentConfig(BaseModel):
    """Defines which agent to load and its specific configuration."""
    type: str
    config: Dict[str, Any]

class AppConfig(BaseModel):
    """The main application configuration model, loaded from config.yaml."""
    sdk: SDKConfig = Field(default_factory=SDKConfig)
    agent: AgentConfig 