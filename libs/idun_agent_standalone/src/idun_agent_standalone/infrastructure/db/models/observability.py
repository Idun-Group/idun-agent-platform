"""SQLAlchemy model for the singleton standalone observability row.

Singleton in standalone (one provider per install) per product call.
Routes are addressed by path, not by id. Absence of the row means no
observability provider is configured.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneObservabilityRow(Base):
    """The singleton observability row.

    Uses a fixed primary key (``"singleton"``) because the resource is
    addressed by route, not by id. The single configured provider is
    wrapped in a one element list at engine config assembly time to
    match ``EngineConfig.observability: list``.
    """

    __tablename__ = "standalone_observability"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    observability_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
