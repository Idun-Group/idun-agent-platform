"""SQLAlchemy model for AGENT_CONFIG table."""

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class AgentConfigModel(Base):
    __tablename__ = "agent_config"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    framework: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    engines: Mapped[list["EngineModel"]] = relationship(back_populates="agent_config")
    managed_agents: Mapped[list["ManagedAgentModel"]] = relationship(back_populates="agent_config")
    deployments: Mapped[list["DeploymentModel"]] = relationship(back_populates="agent_config")


