"""SQLAlchemy model for managed_agents table."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base

if TYPE_CHECKING:
    from app.infrastructure.db.models.agent_guardrail import AgentGuardrailModel
    from app.infrastructure.db.models.agent_integration import AgentIntegrationModel
    from app.infrastructure.db.models.agent_mcp_server import AgentMCPServerModel
    from app.infrastructure.db.models.agent_observability import (
        AgentObservabilityModel,
    )
    from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
    from app.infrastructure.db.models.managed_sso import ManagedSSOModel


class ManagedAgentModel(Base):
    __tablename__ = "managed_agents"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    engine_config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    agent_hash: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )

    workspace_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 1:1 resource FK columns
    memory_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_memories.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    sso_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_ssos.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # 1:1 relationships
    memory: Mapped[ManagedMemoryModel | None] = relationship(
        "ManagedMemoryModel", lazy="selectin"
    )
    sso: Mapped[ManagedSSOModel | None] = relationship(
        "ManagedSSOModel", lazy="selectin"
    )

    # Many-to-many junction relationships
    guardrail_associations: Mapped[list[AgentGuardrailModel]] = relationship(
        "AgentGuardrailModel",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    mcp_server_associations: Mapped[list[AgentMCPServerModel]] = relationship(
        "AgentMCPServerModel",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    observability_associations: Mapped[list[AgentObservabilityModel]] = relationship(
        "AgentObservabilityModel",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    integration_associations: Mapped[list[AgentIntegrationModel]] = relationship(
        "AgentIntegrationModel",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
