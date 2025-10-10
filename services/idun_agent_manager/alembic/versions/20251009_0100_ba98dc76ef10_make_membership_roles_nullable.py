"""make membership role columns nullable (deprecate)

Revision ID: ba98dc76ef10
Revises: 7f8e9d0c1b2a
Create Date: 2025-10-09 01:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ba98dc76ef10"
down_revision: Union[str, None] = "7f8e9d0c1b2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.alter_column("tenant_users", "role", existing_type=sa.TEXT(), nullable=True)
    except Exception:
        pass
    try:
        op.alter_column("workspace_users", "role", existing_type=sa.TEXT(), nullable=True)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.alter_column("tenant_users", "role", existing_type=sa.TEXT(), nullable=False, server_default=sa.text("'member'::text"))
    except Exception:
        pass
    try:
        op.alter_column("workspace_users", "role", existing_type=sa.TEXT(), nullable=False, server_default=sa.text("'member'::text"))
    except Exception:
        pass


