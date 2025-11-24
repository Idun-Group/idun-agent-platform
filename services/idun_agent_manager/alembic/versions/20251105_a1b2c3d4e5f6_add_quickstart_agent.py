"""add quickstart agent

Revision ID: a1b2c3d4e5f6
Revises: 89b027b15016
Create Date: 2025-11-05 00:00:00.000000+00:00
"""

from typing import Sequence, Union
import uuid
import json
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '89b027b15016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()

    result = connection.execute(
        sa.text("SELECT COUNT(*) FROM managed_agents WHERE name = 'Quickstart Agent'")
    )
    count = result.scalar()

    if count == 0:
        agent_id = "56bd3780-24f2-4f38-bdf8-7bf89a92567e"
        agent_hash = "5301ca0c03f221b0aadda428bc335dd1811871e0bd32a30af5f73a5ab20ab733"
        now = datetime.now(timezone.utc)

        engine_config = {
            "server": {
                "api": {
                    "port": 8000
                }
            },
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "quickstart",
                    "graph_definition": "example_agent.py:app",
                    "checkpointer": {
                        "type": "sqlite",
                        "db_url": "sqlite:///example_checkpoint.db"
                    }
                }
            }
        }

        managed_agents = sa.table(
            'managed_agents',
            sa.column('id', sa.UUID()),
            sa.column('name', sa.String()),
            sa.column('status', sa.String()),
            sa.column('version', sa.String()),
            sa.column('engine_config', JSONB),
            sa.column('created_at', sa.DateTime()),
            sa.column('updated_at', sa.DateTime()),
            sa.column('agent_hash', sa.String())
        )

        op.execute(
            managed_agents.insert().values(
                id=agent_id,
                name="Quickstart Agent",
                status="active",
                version="0.1.0",
                engine_config=engine_config,
                created_at=now,
                updated_at=now,
                agent_hash=agent_hash
            )
        )
        print(f"Created Quickstart Agent with ID: {agent_id}")
    else:
        print(f"Skipped: Quickstart Agent already exists")


def downgrade() -> None:
    connection = op.get_bind()

    result = connection.execute(
        sa.text("""
            DELETE FROM managed_agents
            WHERE name = :name AND version = :version
        """),
        {
            "name": "Quickstart Agent",
            "version": "0.1.0"
        }
    )

    if result.rowcount > 0:
        print(f"Removed {result.rowcount} Quickstart Agent record(s)")
    else:
        print("No Quickstart Agent found to remove")
