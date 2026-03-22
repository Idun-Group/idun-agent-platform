"""Add agent resource relations (FK columns + junction tables).

Adds memory_id and sso_id FK columns to managed_agents, and creates
four junction tables: agent_guardrails, agent_mcp_servers,
agent_observabilities, agent_integrations.

Revision ID: c1d2e3f4a5b6
Revises: b5c6d7e8f9a0
Create Date: 2026-03-07 00:01:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- 1:1 FK columns on managed_agents ---
    op.add_column(
        "managed_agents",
        sa.Column("memory_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "managed_agents",
        sa.Column("sso_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_managed_agents_memory_id", "managed_agents", ["memory_id"])
    op.create_index("ix_managed_agents_sso_id", "managed_agents", ["sso_id"])
    op.create_foreign_key(
        "fk_managed_agents_memory_id",
        "managed_agents",
        "managed_memories",
        ["memory_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_managed_agents_sso_id",
        "managed_agents",
        "managed_ssos",
        ["sso_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # --- agent_guardrails junction table ---
    op.create_table(
        "agent_guardrails",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "guardrail_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_guardrails.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("position", sa.String(10), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("agent_id", "guardrail_id", "position"),
        sa.CheckConstraint(
            "position IN ('input', 'output')", name="ck_guardrail_position"
        ),
    )
    op.create_index("ix_agent_guardrails_agent_id", "agent_guardrails", ["agent_id"])
    op.create_index(
        "ix_agent_guardrails_guardrail_id", "agent_guardrails", ["guardrail_id"]
    )

    # --- agent_mcp_servers junction table ---
    op.create_table(
        "agent_mcp_servers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "mcp_server_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_mcp_servers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("agent_id", "mcp_server_id"),
    )
    op.create_index("ix_agent_mcp_servers_agent_id", "agent_mcp_servers", ["agent_id"])
    op.create_index(
        "ix_agent_mcp_servers_mcp_server_id", "agent_mcp_servers", ["mcp_server_id"]
    )

    # --- agent_observabilities junction table ---
    op.create_table(
        "agent_observabilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "observability_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_observabilities.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("agent_id", "observability_id"),
    )
    op.create_index(
        "ix_agent_observabilities_agent_id", "agent_observabilities", ["agent_id"]
    )
    op.create_index(
        "ix_agent_observabilities_observability_id",
        "agent_observabilities",
        ["observability_id"],
    )

    # --- agent_integrations junction table ---
    op.create_table(
        "agent_integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "integration_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("managed_integrations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("agent_id", "integration_id"),
    )
    op.create_index(
        "ix_agent_integrations_agent_id", "agent_integrations", ["agent_id"]
    )
    op.create_index(
        "ix_agent_integrations_integration_id",
        "agent_integrations",
        ["integration_id"],
    )


def downgrade() -> None:
    op.drop_table("agent_integrations")
    op.drop_table("agent_observabilities")
    op.drop_table("agent_mcp_servers")
    op.drop_table("agent_guardrails")

    op.drop_constraint("fk_managed_agents_sso_id", "managed_agents", type_="foreignkey")
    op.drop_constraint(
        "fk_managed_agents_memory_id", "managed_agents", type_="foreignkey"
    )
    op.drop_index("ix_managed_agents_sso_id", "managed_agents")
    op.drop_index("ix_managed_agents_memory_id", "managed_agents")
    op.drop_column("managed_agents", "sso_id")
    op.drop_column("managed_agents", "memory_id")
