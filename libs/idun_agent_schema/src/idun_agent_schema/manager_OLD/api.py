"""Pydantic schemas for Agent Manager API I/O."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from ..engine.config import AgentConfig, EngineConfig
from .domain import AgentFramework, AgentStatus




class AgentRunRequest(BaseModel):
    """Request payload to execute an agent run."""

    input_data: dict[str, Any]
    trace_id: str | None = Field(None, max_length=100)


class AgentResponse(BaseModel):
    """Response shape for a single agent resource."""

    id: UUID
    name: str
    description: str | None
    framework: AgentFramework
    status: AgentStatus
    config: dict[str, Any]
    environment_variables: dict[str, str]
    version: str
    tags: list[str]
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    deployed_at: datetime | None
    total_runs: int
    success_rate: float | None
    avg_response_time_ms: float | None

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True


class AgentSummaryResponse(BaseModel):
    """Reduced agent fields for listing views."""

    id: UUID
    name: str
    description: str | None
    framework: AgentFramework
    status: AgentStatus
    version: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    total_runs: int
    success_rate: float | None

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True


class AgentRunResponse(BaseModel):
    """Detailed run record returned after execution."""

    id: UUID
    agent_id: UUID
    tenant_id: UUID
    input_data: dict[str, Any]
    output_data: dict[str, Any] | None
    status: str
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None
    response_time_ms: float | None
    tokens_used: int | None
    cost_usd: float | None
    trace_id: str | None
    span_id: str | None

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True


class AgentRunSummaryResponse(BaseModel):
    """Reduced run fields for list views."""

    id: UUID
    agent_id: UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    response_time_ms: float | None
    tokens_used: int | None
    cost_usd: float | None

    class Config:
        """Pydantic configuration for ORM compatibility."""

        from_attributes = True


class PaginatedResponse(BaseModel):
    """Base pagination container used by list endpoints."""

    total: int
    limit: int
    offset: int
    has_more: bool


class PaginatedAgentsResponse(PaginatedResponse):
    """Paginated list of agents."""

    items: list[AgentSummaryResponse]


class PaginatedRunsResponse(PaginatedResponse):
    """Paginated list of agent runs."""

    items: list[AgentRunSummaryResponse]


class AgentStatsResponse(BaseModel):
    """Aggregated statistics across all agents."""

    total_agents: int
    active_agents: int
    total_runs_today: int
    total_runs_this_month: int
    avg_success_rate: float | None
    avg_response_time_ms: float | None


class AgentCreate(BaseModel):
    """Schema for creating a new agent.

    Framework is inferred from config.type (e.g., config.type = "langgraph").
    """

    name: str = Field(..., min_length=1, max_length=100, description="Agent name")
    description: str | None = Field(
        None, max_length=500, description="Agent description"
    )
    # Use schema's AgentConfig instead of AgentPayload
    config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )

    @field_validator("name")  # noqa: N805 - Pydantic validator uses `cls` by convention
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty or whitespace only")
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "name": "My AI Assistant",
                "description": "A helpful AI assistant for customer support",
                "config": {
                    "type": "langgraph",
                    "config": {
                        "name": "My AI Assistant",
                        "graph_definition": "./examples/01_basic_config_file/example_agent.py:app",
                        "checkpointer": None,
                        "store": None,
                        "input_schema_definition": {},
                        "output_schema_definition": {},
                        "observability": None,
                    },
                },
            }
        }


class AgentUpdate(BaseModel):
    """Schema for updating an existing agent."""

    name: str | None = Field(
        None, min_length=1, max_length=100, description="Agent name"
    )
    description: str | None = Field(
        None, max_length=500, description="Agent description"
    )
    framework: AgentFramework | None = Field(None, description="Agent framework")

    @field_validator("name")  # noqa: N805
    @classmethod
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Name cannot be empty or whitespace only")
        return v.strip() if v else v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Updated Agent Name",
                "description": "Updated description",
                "framework": "langchain",
            }
        }


class Agent(BaseModel):
    """Complete agent model for responses."""

    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., description="Agent name")
    description: str | None = Field(None, description="Agent description")
    framework: AgentFramework = Field(..., description="Agent framework")
    status: AgentStatus = Field(AgentStatus.DRAFT, description="Agent status")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "My AI Assistant",
                "description": "A helpful AI assistant",
                "framework": "langgraph",
                "status": "draft",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00",
            }
        }


class AgentReplace(BaseModel):
    """Full replacement schema for PUT of an agent.

    Represents the complete updatable representation of an agent.
    Server-managed fields like id, status, and timestamps are excluded.
    """

    name: str = Field(..., min_length=1, max_length=100, description="Agent name")
    description: str | None = Field(
        None, max_length=500, description="Agent description"
    )
    config: AgentConfig = Field(
        ..., description="Framework-specific agent configuration"
    )

    @field_validator("name")  # noqa: N805
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty or whitespace only")
        return v.strip()


class AgentPatch(BaseModel):
    """Partial update schema for PATCH of an agent.

    Only provided fields will be updated. If config is provided, the
    framework will be inferred from config.type.
    """

    name: str | None = Field(
        None, min_length=1, max_length=100, description="Agent name"
    )
    description: str | None = Field(
        None, max_length=500, description="Agent description"
    )
    config: AgentConfig | None = Field(
        None, description="Framework-specific agent configuration"
    )

    @field_validator("name")  # noqa: N805
    @classmethod
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Name cannot be empty or whitespace only")
        return v.strip() if v else v
