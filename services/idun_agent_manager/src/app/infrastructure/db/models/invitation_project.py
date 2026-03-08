"""SQLAlchemy model for invitation_projects table.

Pre-assigns project roles when inviting a user to a workspace.
"""

from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.session import Base


class InvitationProjectModel(Base):
    __tablename__ = "invitation_projects"

    __table_args__ = (
        UniqueConstraint(
            "invitation_id", "project_id", name="uq_invitation_project"
        ),
        CheckConstraint(
            "role IN ('admin', 'contributor', 'reader')",
            name="chk_invitation_project_role",
        ),
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    invitation_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspace_invitations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
