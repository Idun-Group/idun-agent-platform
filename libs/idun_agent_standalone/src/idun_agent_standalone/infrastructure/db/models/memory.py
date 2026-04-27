"""SQLAlchemy model for the singleton standalone memory row."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneMemoryRow(Base):
    """The singleton memory row.

    Uses a fixed primary key (``"singleton"``) because the resource is
    addressed by route, not by id. Absence of the row means the agent
    uses the in-memory default at assembly.
    """

    __tablename__ = "standalone_memory"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    agent_framework: Mapped[str] = mapped_column(String(50), nullable=False)
    memory_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
