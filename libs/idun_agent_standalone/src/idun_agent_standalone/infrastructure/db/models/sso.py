"""SQLAlchemy model for the singleton standalone SSO row.

Singleton in standalone (one OIDC provider per install) per product
call. Routes are addressed by path, not by id. Absence of the row
means SSO is not configured and agent routes are unprotected.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneSsoRow(Base):
    """The singleton SSO row.

    Uses a fixed primary key (``"singleton"``) because the resource is
    addressed by route, not by id. The stored ``sso_config`` mirrors
    the engine ``SSOConfig`` shape and is layered onto the engine
    config at assembly time.
    """

    __tablename__ = "standalone_sso"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    sso_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
