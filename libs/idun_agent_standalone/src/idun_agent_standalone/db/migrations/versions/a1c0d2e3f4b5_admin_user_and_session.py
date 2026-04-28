"""admin_user and session tables

Revision ID: a1c0d2e3f4b5
Revises: 5e05fbe68d61
Create Date: 2026-04-29 09:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "a1c0d2e3f4b5"
down_revision = "5e05fbe68d61"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "standalone_admin_user",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("password_rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "standalone_session",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("standalone_session")
    op.drop_table("standalone_admin_user")
