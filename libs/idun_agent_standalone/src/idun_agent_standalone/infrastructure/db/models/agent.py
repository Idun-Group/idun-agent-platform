"""SQLAlchemy model for the singleton standalone agent row."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class StandaloneAgentRow(Base):
    """The singleton agent row.

    Singleton is enforced at app level (one row at a time). The UUID
    primary key is preserved for cross-system identity when the install
    is later enrolled into Governance Hub.
    """

    __tablename__ = "standalone_agent"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    base_engine_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
