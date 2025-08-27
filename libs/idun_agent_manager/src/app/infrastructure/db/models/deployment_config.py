"""SQLAlchemy model for DEPLOYMENT_CONFIG table."""

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class DeploymentConfigModel(Base):
    __tablename__ = "deployment_config"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    managed_engine_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("managed_agent.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    config_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    managed_agent: Mapped["ManagedAgentModel"] = relationship(
        "ManagedAgentModel", back_populates="deployment_configs"
    )


