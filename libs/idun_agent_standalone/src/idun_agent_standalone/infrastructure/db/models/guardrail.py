"""SQLAlchemy model for the standalone guardrail collection.

Each row is one configured guardrail. ``position`` and ``sort_order``
fold the manager's ``agent_guardrails`` junction table into the row
itself for the single agent case. Disabled rows are skipped at engine
config assembly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class StandaloneGuardrailRow(Base):
    """One configured guardrail."""

    __tablename__ = "standalone_guardrail"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    position: Mapped[str] = mapped_column(String(10), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    guardrail_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
