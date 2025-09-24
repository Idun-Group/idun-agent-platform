"""SQLAlchemy model for ARTIFACTS table."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class ArtifactModel(Base):
    __tablename__ = "artifacts"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    deployment_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Multi-tenancy scoping
    tenant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    workspace_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    # Relationships
    deployment: Mapped["DeploymentModel"] = relationship(
        "DeploymentModel", back_populates="artifacts"
    )


