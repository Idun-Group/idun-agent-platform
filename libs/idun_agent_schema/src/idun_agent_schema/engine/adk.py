"""Configuration models for ADK agents."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from .base_agent import BaseAgentConfig


class AdkInMemorySessionConfig(BaseModel):
    """Configuration for In-Memory Session Service."""

    type: Literal["in_memory"] = "in_memory"


class AdkVertexAiSessionConfig(BaseModel):
    """Configuration for Vertex AI Session Service."""

    type: Literal["vertex_ai"] = "vertex_ai"
    project_id: str = Field(..., description="Google Cloud Project ID")
    location: str = Field(..., description="Google Cloud Location (e.g. us-central1)")
    reasoning_engine_app_name: str = Field(
        ..., description="Reasoning Engine Application Name or ID"
    )


class AdkDatabaseSessionConfig(BaseModel):
    """Configuration for Database Session Service."""

    type: Literal["database"] = "database"
    db_url: str = Field(..., description="Database URL (e.g. postgresql://...)")


SessionServiceConfig = Annotated[
    Union[AdkInMemorySessionConfig, AdkVertexAiSessionConfig, AdkDatabaseSessionConfig],
    Field(discriminator="type"),
]


class AdkInMemoryMemoryConfig(BaseModel):
    """Configuration for In-Memory Memory Service."""

    type: Literal["in_memory"] = "in_memory"


class AdkVertexAiMemoryConfig(BaseModel):
    """Configuration for Vertex AI Memory Service."""

    type: Literal["vertex_ai"] = "vertex_ai"
    project_id: str = Field(..., description="Google Cloud Project ID")
    location: str = Field(..., description="Google Cloud Location")
    memory_bank_id: str | None = Field(
        None, description="Vertex AI Memory Bank Resource ID"
    )


MemoryServiceConfig = Annotated[
    Union[AdkInMemoryMemoryConfig, AdkVertexAiMemoryConfig],
    Field(discriminator="type"),
]


class AdkAgentConfig(BaseAgentConfig):
    """Configuration model for ADK agents."""
    agent: str = Field(
        ..., description="Agent definition (e.g. module.path:agent_instance)"
    )
    app_name: str = Field(..., description="Application name for the agent")
    session_service: SessionServiceConfig | None = Field(
        default=None, description="Session service configuration"
    )
    memory_service: MemoryServiceConfig | None = Field(
        default=None, description="Memory service configuration"
    )
