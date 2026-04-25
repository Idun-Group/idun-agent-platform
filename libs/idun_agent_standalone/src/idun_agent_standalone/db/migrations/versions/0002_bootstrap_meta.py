"""bootstrap meta

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bootstrap_meta",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("config_hash", sa.String(64), nullable=False),
        sa.Column(
            "bootstrapped_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("bootstrap_meta")
