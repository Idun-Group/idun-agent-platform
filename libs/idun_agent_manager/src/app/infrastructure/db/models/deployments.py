"""SQLAlchemy model for DEPLOYMENTS table."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.session import Base


class DeploymentModel(Base):
    __tablename__ = "deployments"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    managed_engine_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("managed_agent.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_config.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    docker_sha: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    managed_agent: Mapped["ManagedAgentModel"] = relationship(
        "ManagedAgentModel", back_populates="deployments"
    )
    agent_config: Mapped["AgentConfigModel"] = relationship(
        "AgentConfigModel", back_populates="deployments"
    )
    artifacts: Mapped[list["ArtifactModel"]] = relationship(
        back_populates="deployment", cascade="all, delete-orphan"
    )


