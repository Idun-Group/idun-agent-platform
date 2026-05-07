"""SQLAlchemy model for standalone admin sessions.

One row per active session. The cookie carries a signed reference to
the row's primary key (the random session id); the row owns TTL via
``expires_at``. Logout removes the row; restart-side cleanup is
handled by ``services/auth.cleanup_expired_sessions``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneSessionRow(Base):
    __tablename__ = "standalone_session"

    # 43+ chars for ``secrets.token_urlsafe(32)`` — String(64) leaves headroom.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
