"""Soft-delete invitations instead of hard-delete.

Add consumed_at column to workspace_invitations for audit/stats.
Replace the unique constraint with a partial unique index that only
applies to non-consumed (pending) invitations.

Revision ID: c6d7e8f9a0b1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-11
"""

from alembic import op
import sqlalchemy as sa

revision = "c6d7e8f9a0b1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add consumed_at column to workspace_invitations
    op.add_column(
        "workspace_invitations",
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Drop old unique constraint, replace with partial unique index
    # (only pending invitations must be unique per email+workspace)
    op.drop_constraint(
        "uq_invitation_email_workspace", "workspace_invitations", type_="unique"
    )
    op.create_index(
        "uq_invitation_email_workspace_pending",
        "workspace_invitations",
        ["email", "workspace_id"],
        unique=True,
        postgresql_where=sa.text("consumed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_invitation_email_workspace_pending", table_name="workspace_invitations"
    )
    op.create_unique_constraint(
        "uq_invitation_email_workspace",
        "workspace_invitations",
        ["email", "workspace_id"],
    )
    op.drop_column("workspace_invitations", "consumed_at")
