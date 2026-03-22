"""SQLAlchemy model for agent_integrations junction table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class AgentIntegrationModel(Base):
    __tablename__ = "agent_integrations"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    integration_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_integrations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    agent: Mapped[ManagedAgentModel] = relationship(  # noqa: F821
        back_populates="integration_associations",
    )
    integration: Mapped[ManagedIntegrationModel] = relationship(lazy="selectin")  # noqa: F821

    __table_args__ = (UniqueConstraint("agent_id", "integration_id"),)
