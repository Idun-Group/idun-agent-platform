"""SQLAlchemy model for AGENT_CONFIG table."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base

if TYPE_CHECKING:  # Avoid circular imports at runtime
    from app.infrastructure.db.models.engine import EngineModel
    from app.infrastructure.db.models.gateway_routes import GatewayRouteModel


class AgentConfigModel(Base):  # table renamed from agent_config → managed_agents
    __tablename__ = "managed_agents"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True) # dans engine schema, à supprimer
    description: Mapped[str | None] = mapped_column(Text, nullable=True) # dans engine schema, à supprimer
    framework: Mapped[str] = mapped_column(String(50), nullable=False) # dans engine schema, à supprimer
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # New configs
    engine_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    run_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Agent hash for identification/verification
    agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

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
    gateway_routes: Mapped[list["GatewayRouteModel"]] = relationship(
        "GatewayRouteModel", back_populates="managed_agent", cascade="all, delete-orphan"
    )
