"""Domain entities for agents - pure business logic, no framework dependencies."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    """Agent status enumeration."""
    
    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"
    ERROR = "error"


class AgentFramework(str, Enum):
    """Supported agent frameworks."""
    
    LANGGRAPH = "langgraph"
    CREWAI = "crewai"
    AUTOGEN = "autogen"
    CUSTOM = "custom"


class AgentEntity(BaseModel):
    """Agent domain entity."""
    
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    framework: AgentFramework
    status: AgentStatus = Field(default=AgentStatus.DRAFT)
    
    # Configuration
    config: Dict[str, Any] = Field(default_factory=dict)
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    
    # Metadata
    version: str = Field(default="1.0.0")
    tags: List[str] = Field(default_factory=list)
    
    # Tenant isolation
    tenant_id: UUID
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    deployed_at: Optional[datetime] = None
    
    # Performance metrics
    total_runs: int = Field(default=0)
    success_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    avg_response_time_ms: Optional[float] = Field(None, ge=0)
    
    def activate(self) -> None:
        """Activate the agent."""
        if self.status == AgentStatus.DRAFT:
            self.status = AgentStatus.ACTIVE
            self.deployed_at = datetime.utcnow()
        else:
            raise ValueError(f"Cannot activate agent in {self.status} status")
    
    def deactivate(self) -> None:
        """Deactivate the agent."""
        if self.status == AgentStatus.ACTIVE:
            self.status = AgentStatus.INACTIVE
        else:
            raise ValueError(f"Cannot deactivate agent in {self.status} status")
    
    def update_metrics(self, success: bool, response_time_ms: float) -> None:
        """Update agent performance metrics."""
        self.total_runs += 1
        
        if self.success_rate is None:
            self.success_rate = 1.0 if success else 0.0
        else:
            # Calculate running average
            current_successes = self.success_rate * (self.total_runs - 1)
            if success:
                current_successes += 1
            self.success_rate = current_successes / self.total_runs
        
        if self.avg_response_time_ms is None:
            self.avg_response_time_ms = response_time_ms
        else:
            # Calculate running average
            total_time = self.avg_response_time_ms * (self.total_runs - 1)
            self.avg_response_time_ms = (total_time + response_time_ms) / self.total_runs
    
    def can_be_deployed(self) -> bool:
        """Check if agent can be deployed."""
        return (
            self.status in [AgentStatus.DRAFT, AgentStatus.INACTIVE] and
            bool(self.name) and
            bool(self.config)
        )


class AgentRunEntity(BaseModel):
    """Agent run domain entity."""
    
    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID
    tenant_id: UUID
    
    # Input/Output
    input_data: Dict[str, Any]
    output_data: Optional[Dict[str, Any]] = None
    
    # Execution details
    status: str  # running, completed, failed
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    # Performance
    response_time_ms: Optional[float] = None
    tokens_used: Optional[int] = None
    cost_usd: Optional[float] = None
    
    # Tracing
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    
    def complete(self, output_data: Dict[str, Any], response_time_ms: float) -> None:
        """Mark run as completed."""
        self.status = "completed"
        self.output_data = output_data
        self.completed_at = datetime.utcnow()
        self.response_time_ms = response_time_ms
    
    def fail(self, error_message: str) -> None:
        """Mark run as failed."""
        self.status = "failed"
        self.error_message = error_message
        self.completed_at = datetime.utcnow()
    
    @property
    def is_completed(self) -> bool:
        """Check if run is completed."""
        return self.status in ["completed", "failed"]
    
    @property
    def was_successful(self) -> bool:
        """Check if run was successful."""
        return self.status == "completed" 