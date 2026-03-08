"""Add session_version to users for session invalidation on role change.

Revision ID: e5f6a7b8c9d0
Revises: b4d5e6f7a8b9
Create Date: 2026-03-07 21:00:00.000000+00:00
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "b4d5e6f7a8b9"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "session_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "session_version")
