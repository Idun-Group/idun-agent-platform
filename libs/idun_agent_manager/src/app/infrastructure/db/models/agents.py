"""SQLAlchemy models for agents."""

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class AgentModel(Base):
    """SQLAlchemy model for agents."""
    
    __tablename__ = "agents"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    
    # Basic information
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    framework: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    
    # Configuration
    config: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    environment_variables: Mapped[Dict[str, str]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    
    # Metadata
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    
    # Tenant isolation
    tenant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now(),
        onupdate=func.now()
    )
    deployed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Performance metrics
    total_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # Relationships
    runs: Mapped[list["AgentRunModel"]] = relationship(
        "AgentRunModel", back_populates="agent", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Agent(id={self.id}, name={self.name}, tenant_id={self.tenant_id})>"


class AgentRunModel(Base):
    """SQLAlchemy model for agent runs."""
    
    __tablename__ = "agent_runs"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    
    # Foreign keys
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    tenant_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    
    # Input/Output
    input_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_data: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    # Execution details
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Performance
    response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # Tracing
    trace_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    span_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Relationships
    agent: Mapped[AgentModel] = relationship("AgentModel", back_populates="runs")
    
    def __repr__(self) -> str:
        return f"<AgentRun(id={self.id}, agent_id={self.agent_id}, status={self.status})>" 