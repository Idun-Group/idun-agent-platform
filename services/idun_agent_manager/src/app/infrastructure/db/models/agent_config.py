"""SQLAlchemy model for AGENT_CONFIG table."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base

if TYPE_CHECKING:  # Avoid circular imports at runtime
    from app.infrastructure.db.models.deployments import DeploymentModel
    from app.infrastructure.db.models.engine import EngineModel
    from app.infrastructure.db.models.managed_agent import ManagedAgentModel


class AgentConfigModel(Base):
    __tablename__ = "agent_config"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    framework: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    # Multi-tenancy scoping
    tenant_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    # Optional workspace scoping (single workspace association for now)
    workspace_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    engines: Mapped[list[EngineModel]] = relationship(
        "EngineModel", back_populates="agent_config"
    )
    managed_agents: Mapped[list[ManagedAgentModel]] = relationship(
        "ManagedAgentModel", back_populates="agent_config"
    )
    deployments: Mapped[list[DeploymentModel]] = relationship(
        "DeploymentModel", back_populates="agent_config"
    )
