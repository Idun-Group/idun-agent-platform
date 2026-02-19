"""Add users, workspaces, memberships tables and workspace_id to resource tables.

Revision ID: a1b2c3d4e5f7
Revises: 42d49e3bc5f7
Create Date: 2026-02-16 00:01:00.000000+00:00
"""

from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "42d49e3bc5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Resource tables that need workspace_id
RESOURCE_TABLES = [
    "managed_agents",
    "managed_mcp_servers",
    "managed_observabilities",
    "managed_memories",
    "managed_guardrails",
]


def upgrade() -> None:
    # 1. Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("picture_url", sa.String(512), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False, server_default="google"),
        sa.Column("provider_sub", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # 2. Create workspaces table
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"])

    # 3. Create memberships table
    op.create_table(
        "memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("user_id", "workspace_id", name="uq_membership_user_workspace"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_workspace_id", "memberships", ["workspace_id"])

    # 4. Insert a default workspace for existing data
    default_ws_id = str(uuid4())
    op.execute(
        sa.text(
            "INSERT INTO workspaces (id, name, slug, created_at, updated_at) "
            "VALUES (CAST(:ws_id AS uuid), :ws_name, :ws_slug, now(), now())"
        ).bindparams(
            ws_id=default_ws_id,
            ws_name="Default Workspace",
            ws_slug=f"default-{default_ws_id[:8]}",
        )
    )

    # 5. Add workspace_id to each resource table (nullable first, then backfill, then NOT NULL)
    for table in RESOURCE_TABLES:
        op.add_column(
            table,
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )
        # Backfill existing rows with the default workspace
        op.execute(
            sa.text(
                f"UPDATE {table} SET workspace_id = CAST(:ws_id AS uuid)"
            ).bindparams(ws_id=default_ws_id)
        )
        # Set NOT NULL constraint
        op.alter_column(table, "workspace_id", nullable=False)
        # Add FK and index
        op.create_foreign_key(
            f"fk_{table}_workspace_id",
            table,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_workspace_id", table, ["workspace_id"])


def downgrade() -> None:
    # Drop workspace_id from resource tables
    for table in RESOURCE_TABLES:
        op.drop_index(f"ix_{table}_workspace_id", table_name=table)
        op.drop_constraint(f"fk_{table}_workspace_id", table, type_="foreignkey")
        op.drop_column(table, "workspace_id")

    # Drop memberships
    op.drop_index("ix_memberships_workspace_id", table_name="memberships")
    op.drop_index("ix_memberships_user_id", table_name="memberships")
    op.drop_table("memberships")

    # Drop workspaces
    op.drop_index("ix_workspaces_slug", table_name="workspaces")
    op.drop_table("workspaces")

    # Drop users
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
