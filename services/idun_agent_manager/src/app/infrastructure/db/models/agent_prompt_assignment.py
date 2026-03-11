"""SQLAlchemy model for agent_prompt_assignments junction table."""

from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.session import Base


class AgentPromptAssignmentModel(Base):
    __tablename__ = "agent_prompt_assignments"

    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_agents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    prompt_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("managed_prompts.id", ondelete="CASCADE"),
        primary_key=True,
    )
