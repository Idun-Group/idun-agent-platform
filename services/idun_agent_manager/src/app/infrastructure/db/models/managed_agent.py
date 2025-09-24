"""SQLAlchemy model for MANAGED_AGENT table."""

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class ManagedAgentModel(Base):
    __tablename__ = "managed_agent"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_config.id", ondelete="CASCADE"), nullable=False, index=True
    )
    engine_version: Mapped[str] = mapped_column(String(50), nullable=False)
    expose_engine: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exposed_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    gateway_conf_json: Mapped[Dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Multi-tenancy scoping
    tenant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    workspace_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    agent_config: Mapped["AgentConfigModel"] = relationship(
        "AgentConfigModel", back_populates="managed_agents"
    )
    deployment_configs: Mapped[list["DeploymentConfigModel"]] = relationship(
        back_populates="managed_agent", cascade="all, delete-orphan"
    )
    retriever_configs: Mapped[list["RetrieverConfigModel"]] = relationship(
        back_populates="managed_agent", cascade="all, delete-orphan"
    )
    deployments: Mapped[list["DeploymentModel"]] = relationship(
        back_populates="managed_agent", cascade="all, delete-orphan"
    )
    gateway_routes: Mapped[list["GatewayRouteModel"]] = relationship(
        back_populates="managed_agent", cascade="all, delete-orphan"
    )


