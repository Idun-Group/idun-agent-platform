"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("framework", sa.String(64), nullable=False),
        sa.Column("graph_definition", sa.Text(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    for t in ("guardrail", "memory", "observability", "theme"):
        cols = [
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        ]
        if t == "guardrail":
            cols.append(
                sa.Column(
                    "enabled", sa.Boolean(), nullable=False, server_default=sa.true()
                )
            )
        op.create_table(t, *cols)
    op.create_table(
        "mcp_server",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "prompt",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("prompt_key", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("prompt_key", "version", name="uq_prompt_key_version"),
    )
    op.create_index("ix_prompt_prompt_key", "prompt", ["prompt_key"])
    op.create_table(
        "integration",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "session",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_event_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "message_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("title", sa.String(255), nullable=True),
    )
    op.create_index("ix_session_last_event_at", "session", ["last_event_at"])
    op.create_table(
        "trace_event",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("session.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_trace_event_session_id", "trace_event", ["session_id"])
    op.create_index("ix_trace_event_run_id", "trace_event", ["run_id"])
    op.create_index("ix_trace_event_event_type", "trace_event", ["event_type"])
    op.create_index("ix_trace_event_created_at", "trace_event", ["created_at"])
    op.create_table(
        "admin_user",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column(
            "password_rotated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    for t in (
        "admin_user",
        "trace_event",
        "session",
        "integration",
        "prompt",
        "mcp_server",
        "theme",
        "observability",
        "memory",
        "guardrail",
        "agent",
    ):
        op.drop_table(t)
