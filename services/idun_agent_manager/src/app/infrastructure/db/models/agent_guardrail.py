"""SQLAlchemy model for agent_guardrails junction table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class AgentGuardrailModel(Base):
    __tablename__ = "agent_guardrails"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    guardrail_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_guardrails.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    position: Mapped[str] = mapped_column(String(10), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    agent: Mapped[ManagedAgentModel] = relationship(  # noqa: F821
        back_populates="guardrail_associations",
    )
    guardrail: Mapped[ManagedGuardrailModel] = relationship(lazy="selectin")  # noqa: F821

    __table_args__ = (
        UniqueConstraint("agent_id", "guardrail_id", "position"),
        CheckConstraint("position IN ('input', 'output')", name="ck_guardrail_position"),
    )
