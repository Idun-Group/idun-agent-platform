"""Add audit timestamps (created_at, updated_at) to all tables.

Standardize audit columns across all tables:
- Add updated_at to memberships, project_memberships, workspace_invitations
- Add created_at + updated_at to invitation_projects, project_resources

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-03-11
"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Tables that already have created_at but missing updated_at ---

    op.add_column(
        "memberships",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.add_column(
        "project_memberships",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.add_column(
        "workspace_invitations",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- Tables missing both created_at and updated_at ---

    op.add_column(
        "invitation_projects",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "invitation_projects",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # project_resources may not exist yet (created conditionally in earlier migration)
    conn = op.get_bind()
    insp = inspect(conn)
    if insp.has_table("project_resources"):
        op.add_column(
            "project_resources",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.add_column(
            "project_resources",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if insp.has_table("project_resources"):
        op.drop_column("project_resources", "updated_at")
        op.drop_column("project_resources", "created_at")
    op.drop_column("invitation_projects", "updated_at")
    op.drop_column("invitation_projects", "created_at")
    op.drop_column("workspace_invitations", "updated_at")
    op.drop_column("project_memberships", "updated_at")
    op.drop_column("memberships", "updated_at")
