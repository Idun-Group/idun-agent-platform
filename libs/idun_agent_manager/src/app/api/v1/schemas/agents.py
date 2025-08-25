"""Pydantic schemas for agent API I/O."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.agents.entities import AgentFramework, AgentStatus


# Request schemas
class AgentCreateRequest(BaseModel):
    """Schema for creating an agent."""
    
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    framework: AgentFramework
    config: Dict[str, Any] = Field(default_factory=dict)
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)


class AgentUpdateRequest(BaseModel):
    """Schema for updating an agent."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    config: Optional[Dict[str, Any]] = None
    environment_variables: Optional[Dict[str, str]] = None
    tags: Optional[List[str]] = None


class AgentRunRequest(BaseModel):
    """Schema for running an agent."""
    
    input_data: Dict[str, Any]
    trace_id: Optional[str] = Field(None, max_length=100)


# Response schemas
class AgentResponse(BaseModel):
    """Schema for agent responses."""
    
    id: UUID
    name: str
    description: Optional[str]
    framework: AgentFramework
    status: AgentStatus
    config: Dict[str, Any]
    environment_variables: Dict[str, str]
    version: str
    tags: List[str]
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    deployed_at: Optional[datetime]
    total_runs: int
    success_rate: Optional[float]
    avg_response_time_ms: Optional[float]
    
    class Config:
        from_attributes = True


class AgentSummaryResponse(BaseModel):
    """Schema for agent summary (list view)."""
    
    id: UUID
    name: str
    description: Optional[str]
    framework: AgentFramework
    status: AgentStatus
    version: str
    tags: List[str]
    created_at: datetime
    updated_at: datetime
    total_runs: int
    success_rate: Optional[float]
    
    class Config:
        from_attributes = True


class AgentRunResponse(BaseModel):
    """Schema for agent run responses."""
    
    id: UUID
    agent_id: UUID
    tenant_id: UUID
    input_data: Dict[str, Any]
    output_data: Optional[Dict[str, Any]]
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]
    response_time_ms: Optional[float]
    tokens_used: Optional[int]
    cost_usd: Optional[float]
    trace_id: Optional[str]
    span_id: Optional[str]
    
    class Config:
        from_attributes = True


class AgentRunSummaryResponse(BaseModel):
    """Schema for agent run summary (list view)."""
    
    id: UUID
    agent_id: UUID
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    response_time_ms: Optional[float]
    tokens_used: Optional[int]
    cost_usd: Optional[float]
    
    class Config:
        from_attributes = True


# Pagination schemas
class PaginatedResponse(BaseModel):
    """Base schema for paginated responses."""
    
    total: int
    limit: int
    offset: int
    has_more: bool


class PaginatedAgentsResponse(PaginatedResponse):
    """Schema for paginated agent responses."""
    
    items: List[AgentSummaryResponse]


class PaginatedRunsResponse(PaginatedResponse):
    """Schema for paginated run responses."""
    
    items: List[AgentRunSummaryResponse]


# Statistics schemas
class AgentStatsResponse(BaseModel):
    """Schema for agent statistics."""
    
    total_agents: int
    active_agents: int
    total_runs_today: int
    total_runs_this_month: int
    avg_success_rate: Optional[float]
    avg_response_time_ms: Optional[float] 