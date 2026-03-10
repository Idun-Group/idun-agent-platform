"""add projects and project_resources tables

Revision ID: a3c7e9f12b45
Revises: b5c6d7e8f9a0
Create Date: 2026-03-04 00:01:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c7e9f12b45"
down_revision: Union[str, None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All DDL and DML uses IF NOT EXISTS / ON CONFLICT DO NOTHING so the
    # migration is idempotent and safe to replay on databases that were
    # stamped from an orphaned revision via table-inspection recovery.

    # 1. Create projects table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT false,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_project_workspace_slug UNIQUE (workspace_id, slug)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_projects_slug ON projects (slug)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_projects_workspace_id ON projects (workspace_id)"
    )

    # 2. Create project_resources table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_resources (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            resource_id UUID NOT NULL,
            resource_type VARCHAR(50) NOT NULL,
            CONSTRAINT uq_project_resource UNIQUE (project_id, resource_id, resource_type)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_project_resources_project_id ON project_resources (project_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_project_resources_resource_id ON project_resources (resource_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_project_resource_lookup ON project_resources (resource_type, resource_id)"
    )

    # 3. Data migration: create default projects for workspaces that don't have one yet
    op.execute(
        """
        INSERT INTO projects (id, name, slug, is_default, workspace_id, created_at, updated_at)
        SELECT gen_random_uuid(), 'Default', 'default', true, w.id, now(), now()
        FROM workspaces w
        WHERE NOT EXISTS (
            SELECT 1 FROM projects p
            WHERE p.workspace_id = w.id AND p.is_default = true
        )
        """
    )

    # 4. Assign existing resources to their workspace's default project
    #    (skip rows that are already assigned)
    resource_tables = [
        ("managed_agents", "agent"),
        ("managed_mcp_servers", "mcp_server"),
        ("managed_observabilities", "observability"),
        ("managed_memories", "memory"),
        ("managed_guardrails", "guardrail"),
        ("managed_integrations", "integration"),
        ("managed_ssos", "sso"),
    ]
    for table_name, resource_type in resource_tables:
        op.execute(
            f"""
            INSERT INTO project_resources (id, project_id, resource_id, resource_type)
            SELECT gen_random_uuid(), p.id, r.id, '{resource_type}'
            FROM {table_name} r
            JOIN projects p ON p.workspace_id = r.workspace_id AND p.is_default = true
            WHERE NOT EXISTS (
                SELECT 1 FROM project_resources pr
                WHERE pr.resource_id = r.id AND pr.resource_type = '{resource_type}'
            )
            """
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS project_resources")
    op.execute("DROP TABLE IF EXISTS projects")
