"""Add workspace ownership + project-scoped RBAC.

Revision ID: 9c8b7a6d5e4f
Revises: 81a65931cb0f
Create Date: 2026-04-09 00:01:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c8b7a6d5e4f"
down_revision: str | None = "81a65931cb0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PROJECT_SCOPED_TABLES = (
    "managed_agents",
    "managed_prompts",
    "managed_guardrails",
    "managed_mcp_servers",
    "managed_memories",
    "managed_observabilities",
    "managed_ssos",
    "managed_integrations",
)


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "memberships",
        sa.Column("is_owner", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(sa.text("UPDATE memberships SET is_owner = (role = 'owner')"))
    op.drop_column("memberships", "role")

    op.add_column(
        "workspace_invitations",
        sa.Column("is_owner", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text(
            "UPDATE workspace_invitations SET is_owner = (role = 'owner')"
        )
    )
    op.drop_column("workspace_invitations", "role")

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
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
        sa.UniqueConstraint("workspace_id", "id", name="uq_project_workspace_id_id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_project_workspace_name"),
    )

    op.create_table(
        "project_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_membership_user"),
        sa.CheckConstraint(
            "role IN ('admin', 'contributor', 'reader')",
            name="ck_project_membership_role",
        ),
    )

    op.create_table(
        "invitation_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invitation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspace_invitations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "invitation_id",
            "project_id",
            name="uq_invitation_project_assignment",
        ),
        sa.CheckConstraint(
            "role IN ('admin', 'contributor', 'reader')",
            name="ck_invitation_project_role",
        ),
    )

    for table_name in PROJECT_SCOPED_TABLES:
        op.add_column(
            table_name,
            sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table_name}_project_id_projects",
            table_name,
            "projects",
            ["project_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.drop_constraint(
        "uq_workspace_prompt_version", "managed_prompts", type_="unique"
    )
    op.create_unique_constraint(
        "uq_workspace_project_prompt_version",
        "managed_prompts",
        ["workspace_id", "project_id", "prompt_id", "version"],
    )

    workspace_rows = bind.execute(sa.text("SELECT id FROM workspaces")).mappings().all()
    default_projects: dict[str, str] = {}
    for row in workspace_rows:
        project_id = uuid4()
        workspace_id = row["id"]
        default_projects[str(workspace_id)] = str(project_id)
        bind.execute(
            sa.text(
                """
                INSERT INTO projects (
                    id,
                    workspace_id,
                    name,
                    description,
                    created_by,
                    is_default
                )
                VALUES (
                    :id,
                    :workspace_id,
                    'Default Project',
                    'Automatically created default project',
                    NULL,
                    TRUE
                )
                """
            ),
            {"id": project_id, "workspace_id": workspace_id},
        )

    for table_name in PROJECT_SCOPED_TABLES:
        for workspace_id, project_id in default_projects.items():
            bind.execute(
                sa.text(
                    f"""
                    UPDATE {table_name}
                    SET project_id = :project_id
                    WHERE workspace_id = :workspace_id
                    """
                ),
                {"workspace_id": workspace_id, "project_id": project_id},
            )

    membership_rows = bind.execute(
        sa.text("SELECT user_id, workspace_id, is_owner FROM memberships")
    ).mappings().all()
    for row in membership_rows:
        project_id = default_projects.get(str(row["workspace_id"]))
        if not project_id:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO project_memberships (id, project_id, user_id, role)
                VALUES (:id, :project_id, :user_id, :role)
                ON CONFLICT (project_id, user_id) DO NOTHING
                """
            ),
            {
                "id": uuid4(),
                "project_id": project_id,
                "user_id": row["user_id"],
                "role": "admin" if row["is_owner"] else "reader",
            },
        )

    invitation_rows = bind.execute(
        sa.text("SELECT id, workspace_id, is_owner FROM workspace_invitations")
    ).mappings().all()
    for row in invitation_rows:
        project_id = default_projects.get(str(row["workspace_id"]))
        if not project_id:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO invitation_projects (id, invitation_id, project_id, role)
                VALUES (:id, :invitation_id, :project_id, :role)
                ON CONFLICT (invitation_id, project_id) DO NOTHING
                """
            ),
            {
                "id": uuid4(),
                "invitation_id": row["id"],
                "project_id": project_id,
                "role": "admin" if row["is_owner"] else "reader",
            },
        )

    for table_name in PROJECT_SCOPED_TABLES:
        op.alter_column(table_name, "project_id", nullable=False)


def downgrade() -> None:
    for table_name in reversed(PROJECT_SCOPED_TABLES):
        op.drop_constraint(
            f"fk_{table_name}_project_id_projects",
            table_name,
            type_="foreignkey",
        )
        op.drop_column(table_name, "project_id")

    op.drop_constraint(
        "uq_workspace_project_prompt_version",
        "managed_prompts",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_workspace_prompt_version",
        "managed_prompts",
        ["workspace_id", "prompt_id", "version"],
    )

    op.drop_table("invitation_projects")
    op.drop_table("project_memberships")
    op.drop_table("projects")

    op.add_column(
        "workspace_invitations",
        sa.Column("role", sa.String(length=50), nullable=False, server_default="member"),
    )
    op.execute(
        sa.text(
            "UPDATE workspace_invitations SET role = CASE WHEN is_owner THEN 'owner' ELSE 'member' END"
        )
    )
    op.drop_column("workspace_invitations", "is_owner")

    op.add_column(
        "memberships",
        sa.Column("role", sa.String(length=50), nullable=False, server_default="member"),
    )
    op.execute(
        sa.text(
            "UPDATE memberships SET role = CASE WHEN is_owner THEN 'owner' ELSE 'member' END"
        )
    )
    op.drop_column("memberships", "is_owner")

    op.drop_column("users", "session_version")
