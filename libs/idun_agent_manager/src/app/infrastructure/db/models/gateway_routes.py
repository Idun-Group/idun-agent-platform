"""SQLAlchemy model for GATEWAY_ROUTES table."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class GatewayRouteModel(Base):
    __tablename__ = "gateway_routes"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    managed_engine_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("managed_agent.id", ondelete="CASCADE"), nullable=False, index=True
    )
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    managed_agent: Mapped["ManagedAgentModel"] = relationship(
        "ManagedAgentModel", back_populates="gateway_routes"
    )


