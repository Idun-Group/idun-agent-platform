"""SQLAlchemy model for the singleton standalone install metadata row.

Renamed from the legacy ``bootstrap_meta`` per design spec to convey
that it survives Governance Hub enrollment. Records the bootstrap
hash used at first seed, the first-boot timestamp, and the last
process start. Read by ``/runtime/status`` in Phase 6.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneInstallMetaRow(Base):
    """The singleton install metadata row.

    Uses a fixed primary key (``"singleton"``) because the resource is
    addressed by service helpers, not by id. ``bootstrap_hash`` stores
    the sha256 of the YAML used at first seed so a future boot can
    warn when the on-disk YAML has drifted from the DB. ``last_seen_at``
    is updated on every boot for future Governance Hub enrollment to
    detect stale installs.
    """

    __tablename__ = "standalone_install_meta"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    bootstrap_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bootstrapped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
