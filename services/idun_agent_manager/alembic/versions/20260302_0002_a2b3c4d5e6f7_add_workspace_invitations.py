"""Add workspace_invitations table.

Revision ID: a2b3c4d5e6f7
Revises: 8f9a1b2c3d4e
Create Date: 2026-03-02 00:02:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "8f9a1b2c3d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "email", "workspace_id", name="uq_invitation_email_workspace"
        ),
    )
    op.create_index(
        "ix_workspace_invitations_workspace_id",
        "workspace_invitations",
        ["workspace_id"],
    )
    op.create_index(
        "ix_workspace_invitations_email",
        "workspace_invitations",
        ["email"],
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_invitations_email", table_name="workspace_invitations")
    op.drop_index(
        "ix_workspace_invitations_workspace_id",
        table_name="workspace_invitations",
    )
    op.drop_table("workspace_invitations")
