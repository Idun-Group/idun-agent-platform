"""Rename agent_config -> managed_agents, drop old managed table, add configs.

Revision ID: 1c3d9f2f7a10
Revises: 9ba231d41688
Create Date: 2025-10-02 16:15:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "1c3d9f2f7a10"
down_revision: Union[str, None] = "9ba231d41688"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop legacy managed tables if present (singular or already-migrated plural)
    op.execute("DROP TABLE IF EXISTS managed_agent CASCADE;")

    # Rename agent_config -> managed_agents if present
    op.execute("ALTER TABLE IF EXISTS agent_config RENAME TO managed_agents;")

    # Add new JSONB columns on managed_agents
    op.execute(
        "ALTER TABLE IF EXISTS managed_agents ADD COLUMN IF NOT EXISTS engine_config JSONB;"
    )
    op.execute(
        "ALTER TABLE IF EXISTS managed_agents ADD COLUMN IF NOT EXISTS run_config JSONB;"
    )

    # Update FKs to point to managed_agents
    # engine.agent_id -> managed_agents.id
    op.execute("ALTER TABLE IF EXISTS engine DROP CONSTRAINT IF EXISTS engine_agent_id_fkey;")
    op.execute(
        """
        ALTER TABLE IF EXISTS engine
        ADD CONSTRAINT engine_agent_id_fkey
        FOREIGN KEY (agent_id) REFERENCES managed_agents(id) ON DELETE CASCADE;
        """
    )

    # gateway_routes.managed_engine_id -> managed_agents.id
    op.execute(
        "ALTER TABLE IF EXISTS gateway_routes DROP CONSTRAINT IF EXISTS gateway_routes_managed_engine_id_fkey;"
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS gateway_routes
        ADD CONSTRAINT gateway_routes_managed_engine_id_fkey
        FOREIGN KEY (managed_engine_id) REFERENCES managed_agents(id) ON DELETE CASCADE;
        """
    )


def downgrade() -> None:
    # Revert FKs back to previous tables
    op.execute(
        "ALTER TABLE IF EXISTS gateway_routes DROP CONSTRAINT IF EXISTS gateway_routes_managed_engine_id_fkey;"
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS gateway_routes
        ADD CONSTRAINT gateway_routes_managed_engine_id_fkey
        FOREIGN KEY (managed_engine_id) REFERENCES managed_agent(id) ON DELETE CASCADE;
        """
    )

    op.execute("ALTER TABLE IF EXISTS engine DROP CONSTRAINT IF EXISTS engine_agent_id_fkey;")
    op.execute(
        """
        ALTER TABLE IF EXISTS engine
        ADD CONSTRAINT engine_agent_id_fkey
        FOREIGN KEY (agent_id) REFERENCES agent_config(id) ON DELETE CASCADE;
        """
    )

    # Drop added columns
    op.execute("ALTER TABLE IF EXISTS managed_agents DROP COLUMN IF EXISTS run_config;")
    op.execute("ALTER TABLE IF EXISTS managed_agents DROP COLUMN IF EXISTS engine_config;")

    # Rename managed_agents back to agent_config
    op.execute("ALTER TABLE IF EXISTS managed_agents RENAME TO agent_config;")

    # Recreate legacy managed_agent table is intentionally omitted

