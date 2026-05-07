"""SQLAlchemy model for the singleton runtime state row.

Records the last reload outcome (status, message, error, timestamp,
applied config hash). The boot-path state machine that derives the
top-level StandaloneRuntimeStatusKind from this row + agent presence
+ engine state is Phase 6's responsibility.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneRuntimeStateRow(Base):
    """The singleton runtime state row.

    Uses a fixed primary key (``"singleton"``) because the row is
    addressed by service helpers, not by id. Absence of the row means
    no reload has been attempted yet (first boot).
    """

    __tablename__ = "standalone_runtime_state"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_reloaded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_applied_config_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
