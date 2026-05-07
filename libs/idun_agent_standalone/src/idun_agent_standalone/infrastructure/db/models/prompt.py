"""SQLAlchemy model for the standalone prompt collection.

Prompts are an append-only versioned collection. Creating with an
existing ``prompt_id`` adds a new version; latest version is selected
at assembly time. No slug, no name, no enabled flag — uniqueness is
on ``(prompt_id, version)``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class StandalonePromptRow(Base):
    """One prompt version."""

    __tablename__ = "standalone_prompt"
    __table_args__ = (
        UniqueConstraint(
            "prompt_id", "version", name="uq_standalone_prompt_id_version"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    prompt_id: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
