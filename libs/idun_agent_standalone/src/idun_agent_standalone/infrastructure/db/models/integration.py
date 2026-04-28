"""SQLAlchemy model for the standalone integration collection.

Each row is one configured integration (WhatsApp, Slack, etc.).
``enabled`` replaces the manager's ``agent_integrations`` junction
table for the single agent case. The standalone row's ``enabled`` is
the single source of truth at assembly time; the inner config's
``enabled`` is overwritten to match.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class StandaloneIntegrationRow(Base):
    """One configured integration."""

    __tablename__ = "standalone_integration"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    integration_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
