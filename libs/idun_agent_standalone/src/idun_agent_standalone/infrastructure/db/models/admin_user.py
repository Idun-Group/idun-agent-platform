"""SQLAlchemy model for the singleton standalone admin user row.

The standalone supports exactly one admin in MVP scope — the row's
primary key is fixed to ``"singleton"`` and the URL never carries an
id. Absence of the row in password mode means the install has not yet
been seeded (boot fails fast in that case; see ``services/auth.py``).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneAdminUserRow(Base):
    __tablename__ = "standalone_admin_user"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    password_rotated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
