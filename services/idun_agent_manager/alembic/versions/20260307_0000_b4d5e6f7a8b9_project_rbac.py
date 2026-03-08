"""Add project-level RBAC: project_memberships, invitation_projects,
migrate memberships.role to is_owner, add project_id FK to resources,
drop project_resources junction table.

Revision ID: b4d5e6f7a8b9
Revises: a3c7e9f12b45
Create Date: 2026-03-07 00:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d5e6f7a8b9"
down_revision: Union[str, None] = "a3c7e9f12b45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All 7 resource tables that get a project_id FK.
RESOURCE_TABLES = [
    "managed_agents",
    "managed_mcp_servers",
    "managed_observabilities",
    "managed_memories",
    "managed_guardrails",
    "managed_integrations",
    "managed_ssos",
]


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. Projects table: add description, created_by, composite unique
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT"
    )
    op.execute(
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS "
        "created_by UUID REFERENCES users(id) ON DELETE SET NULL"
    )
    # Composite unique for defense-in-depth FK from resource tables
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_workspace_id'
            ) THEN
                ALTER TABLE projects
                    ADD CONSTRAINT uq_project_workspace_id UNIQUE (workspace_id, id);
            END IF;
        END $$
        """
    )
    # Partial unique index: one default project per workspace
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_one_default_per_workspace
            ON projects(workspace_id) WHERE is_default = TRUE
        """
    )

    # -----------------------------------------------------------------------
    # 2. Memberships: add is_owner column, migrate from role, drop role
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_owner BOOLEAN"
    )
    # Migrate: admin/owner → is_owner=true, everything else → false
    op.execute(
        """
        UPDATE memberships SET is_owner = CASE
            WHEN role IN ('admin', 'owner') THEN true
            ELSE false
        END
        WHERE is_owner IS NULL
        """
    )
    op.execute(
        "ALTER TABLE memberships ALTER COLUMN is_owner SET NOT NULL"
    )
    op.execute(
        "ALTER TABLE memberships ALTER COLUMN is_owner SET DEFAULT false"
    )
    # Drop the old role column
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'memberships' AND column_name = 'role'
            ) THEN
                ALTER TABLE memberships DROP COLUMN role;
            END IF;
        END $$
        """
    )

    # -----------------------------------------------------------------------
    # 3. Workspace invitations: add is_owner column, migrate, drop role
    # -----------------------------------------------------------------------
    # First ensure the table exists (it may have been created in a different
    # migration or by the application).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_invitations (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            is_owner BOOLEAN NOT NULL DEFAULT false,
            invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_invitation_email_workspace UNIQUE (email, workspace_id)
        )
        """
    )
    # If the table already existed with a role column, migrate it
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'workspace_invitations' AND column_name = 'role'
            ) THEN
                -- Add is_owner if not present
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'workspace_invitations' AND column_name = 'is_owner'
                ) THEN
                    ALTER TABLE workspace_invitations
                        ADD COLUMN is_owner BOOLEAN DEFAULT false;
                END IF;
                -- Migrate data
                UPDATE workspace_invitations SET is_owner = CASE
                    WHEN role IN ('admin', 'owner') THEN true
                    ELSE false
                END
                WHERE is_owner IS NULL;
                ALTER TABLE workspace_invitations ALTER COLUMN is_owner SET NOT NULL;
                ALTER TABLE workspace_invitations DROP COLUMN role;
            END IF;
        END $$
        """
    )

    # -----------------------------------------------------------------------
    # 4. Create project_memberships table
    # -----------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_memberships (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_project_membership_project_user UNIQUE (project_id, user_id),
            CONSTRAINT chk_project_membership_role
                CHECK (role IN ('admin', 'contributor', 'reader'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pm_project "
        "ON project_memberships(project_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pm_user "
        "ON project_memberships(user_id)"
    )

    # -----------------------------------------------------------------------
    # 5. Create invitation_projects table
    # -----------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_projects (
            id UUID PRIMARY KEY,
            invitation_id UUID NOT NULL
                REFERENCES workspace_invitations(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL,
            CONSTRAINT uq_invitation_project UNIQUE (invitation_id, project_id),
            CONSTRAINT chk_invitation_project_role
                CHECK (role IN ('admin', 'contributor', 'reader'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ip_invitation "
        "ON invitation_projects(invitation_id)"
    )

    # -----------------------------------------------------------------------
    # 6. Data migration: create project_memberships for existing users
    # -----------------------------------------------------------------------
    # Workspace owners → admin on every project in their workspace
    op.execute(
        """
        INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
        SELECT gen_random_uuid(), p.id, m.user_id, 'admin', now()
        FROM memberships m
        JOIN projects p ON p.workspace_id = m.workspace_id
        WHERE m.is_owner = true
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )
    # Regular members → reader on default project only
    op.execute(
        """
        INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
        SELECT gen_random_uuid(), p.id, m.user_id, 'reader', now()
        FROM memberships m
        JOIN projects p ON p.workspace_id = m.workspace_id AND p.is_default = true
        WHERE m.is_owner = false
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )

    # -----------------------------------------------------------------------
    # 7. Add project_id FK to all resource tables + data migration
    # -----------------------------------------------------------------------
    for table in RESOURCE_TABLES:
        # Add the column (nullable first for migration)
        op.execute(
            f"ALTER TABLE {table} "
            f"ADD COLUMN IF NOT EXISTS project_id UUID"
        )

        # Populate project_id from existing project_resources junction table.
        # Policy:
        #   - If resource is in exactly 1 project → use that project
        #   - If resource is in multiple projects → use first non-default
        #     (by project creation date), fall back to default
        #   - If resource is in 0 projects → use workspace default project
        type_map = {
            "managed_agents": "agent",
            "managed_mcp_servers": "mcp_server",
            "managed_observabilities": "observability",
            "managed_memories": "memory",
            "managed_guardrails": "guardrail",
            "managed_integrations": "integration",
            "managed_ssos": "sso",
        }
        rtype = type_map[table]

        # First: populate from junction table (prefer non-default projects)
        op.execute(
            f"""
            UPDATE {table} r
            SET project_id = sub.project_id
            FROM (
                SELECT DISTINCT ON (pr.resource_id) pr.resource_id, pr.project_id
                FROM project_resources pr
                JOIN projects p ON p.id = pr.project_id
                WHERE pr.resource_type = '{rtype}'
                ORDER BY pr.resource_id, p.is_default ASC, p.created_at ASC
            ) sub
            WHERE r.id = sub.resource_id AND r.project_id IS NULL
            """
        )

        # Second: any resources still without project_id → default project
        op.execute(
            f"""
            UPDATE {table} r
            SET project_id = p.id
            FROM projects p
            WHERE p.workspace_id = r.workspace_id
              AND p.is_default = true
              AND r.project_id IS NULL
            """
        )

        # Make project_id NOT NULL
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN project_id SET NOT NULL"
        )

        # Add composite FK for defense-in-depth (workspace_id, project_id)
        fk_name = f"fk_{table}_workspace_project"
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = '{fk_name}'
                ) THEN
                    ALTER TABLE {table}
                        ADD CONSTRAINT {fk_name}
                        FOREIGN KEY (workspace_id, project_id)
                        REFERENCES projects(workspace_id, id);
                END IF;
            END $$
            """
        )

        # Index on project_id
        op.execute(
            f"CREATE INDEX IF NOT EXISTS ix_{table}_project_id "
            f"ON {table}(project_id)"
        )

    # -----------------------------------------------------------------------
    # 8. Drop the project_resources junction table (no longer needed)
    # -----------------------------------------------------------------------
    op.execute("DROP TABLE IF EXISTS project_resources")


def downgrade() -> None:
    # Recreate project_resources junction table
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

    # Remove project_id from resource tables
    for table in RESOURCE_TABLES:
        fk_name = f"fk_{table}_workspace_project"
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = '{fk_name}'
                ) THEN
                    ALTER TABLE {table} DROP CONSTRAINT {fk_name};
                END IF;
            END $$
            """
        )
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_project_id")
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = '{table}' AND column_name = 'project_id'
                ) THEN
                    ALTER TABLE {table} DROP COLUMN project_id;
                END IF;
            END $$
            """
        )

    # Drop new tables
    op.execute("DROP TABLE IF EXISTS invitation_projects")
    op.execute("DROP TABLE IF EXISTS project_memberships")

    # Revert memberships: add role back, drop is_owner
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'memberships' AND column_name = 'role'
            ) THEN
                ALTER TABLE memberships ADD COLUMN role VARCHAR(50);
                UPDATE memberships SET role = CASE
                    WHEN is_owner = true THEN 'admin'
                    ELSE 'member'
                END;
                ALTER TABLE memberships ALTER COLUMN role SET NOT NULL;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'memberships' AND column_name = 'is_owner'
            ) THEN
                ALTER TABLE memberships DROP COLUMN is_owner;
            END IF;
        END $$
        """
    )

    # Revert projects: drop new columns and constraints
    op.execute("DROP INDEX IF EXISTS uq_one_default_per_workspace")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_workspace_id'
            ) THEN
                ALTER TABLE projects DROP CONSTRAINT uq_project_workspace_id;
            END IF;
        END $$
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'created_by'
            ) THEN
                ALTER TABLE projects DROP COLUMN created_by;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'description'
            ) THEN
                ALTER TABLE projects DROP COLUMN description;
            END IF;
        END $$
        """
    )
