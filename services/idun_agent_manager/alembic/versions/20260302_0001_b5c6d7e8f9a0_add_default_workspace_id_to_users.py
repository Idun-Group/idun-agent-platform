"""Add default_workspace_id to users table.

Revision ID: b5c6d7e8f9a0
Revises: 4e21ee5d39eb
Create Date: 2026-03-02 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "4e21ee5d39eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "default_workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_users_default_workspace_id", "users", ["default_workspace_id"]
    )

    # Backfill: set default_workspace_id to each user's earliest membership workspace
    op.execute(
        sa.text("""
            UPDATE users u
            SET default_workspace_id = sub.workspace_id
            FROM (
                SELECT DISTINCT ON (user_id) user_id, workspace_id
                FROM memberships
                ORDER BY user_id, created_at ASC
            ) sub
            WHERE u.id = sub.user_id AND u.default_workspace_id IS NULL
        """)
    )


def downgrade() -> None:
    op.drop_index("ix_users_default_workspace_id", table_name="users")
    op.drop_column("users", "default_workspace_id")
