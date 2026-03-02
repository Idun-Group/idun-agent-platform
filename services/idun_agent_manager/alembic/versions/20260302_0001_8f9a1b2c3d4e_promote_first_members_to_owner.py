"""Promote first member of each workspace to owner role.

For each workspace, the earliest membership (by created_at) is promoted
from "admin" to "owner". Other memberships are left unchanged.
This is a data-only migration — no schema changes.

Revision ID: 8f9a1b2c3d4e
Revises: 4e21ee5d39eb
Create Date: 2026-03-02 00:01:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8f9a1b2c3d4e"
down_revision: Union[str, None] = "4e21ee5d39eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # For each workspace, promote the earliest "admin" membership to "owner".
    # Uses a CTE to find the first membership per workspace (by created_at).
    op.execute(
        """
        UPDATE memberships
        SET role = 'owner'
        WHERE id IN (
            SELECT DISTINCT ON (workspace_id) id
            FROM memberships
            WHERE role = 'admin'
            ORDER BY workspace_id, created_at ASC
        )
        """
    )


def downgrade() -> None:
    # Revert all "owner" roles back to "admin"
    op.execute(
        """
        UPDATE memberships
        SET role = 'admin'
        WHERE role = 'owner'
        """
    )
