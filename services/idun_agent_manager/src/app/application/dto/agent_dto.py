"""Data Transfer Objects for agent operations."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.agents.entities import AgentFramework, AgentStatus


class AgentCreateDTO(BaseModel):
    """DTO for creating an agent."""
    
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    framework: AgentFramework
    config: Dict[str, Any] = Field(default_factory=dict)
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    tenant_id: UUID


class AgentUpdateDTO(BaseModel):
    """DTO for updating an agent."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    config: Optional[Dict[str, Any]] = None
    environment_variables: Optional[Dict[str, str]] = None
    tags: Optional[List[str]] = None


class AgentDeploymentDTO(BaseModel):
    """DTO for agent deployment information."""
    
    agent_id: UUID
    container_id: str
    endpoint: str
    status: str
    framework: str
    deployed_at: Optional[datetime] = None


class AgentHealthDTO(BaseModel):
    """DTO for agent health status."""
    
    agent_id: UUID
    status: str
    uptime: Optional[str] = None
    cpu_usage: Optional[str] = None
    memory_usage: Optional[str] = None
    last_activity: Optional[str] = None
    error: Optional[str] = None


class AgentRunCreateDTO(BaseModel):
    """DTO for creating an agent run."""
    
    agent_id: UUID
    tenant_id: UUID
    input_data: Dict[str, Any]
    trace_id: Optional[str] = None


class AgentMetricsDTO(BaseModel):
    """DTO for agent performance metrics."""
    
    agent_id: UUID
    total_runs: int
    success_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    avg_response_time_ms: Optional[float] = Field(None, ge=0)
    last_run_at: Optional[datetime] = None
