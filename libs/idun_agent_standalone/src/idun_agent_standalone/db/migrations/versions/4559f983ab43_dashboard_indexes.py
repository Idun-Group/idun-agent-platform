"""dashboard indexes

Revision ID: 4559f983ab43
Revises: c08f88a64574
Create Date: 2026-05-11 20:31:56.025019

Two new indexes to support dashboard aggregation queries (see
``services/dashboard.py``):
 1. ``ix_standalone_trace_started_at_status`` -- range + error-rate filter
 2. ``ix_standalone_span_started_at_status_name`` -- Top errors GROUP BY
"""

from __future__ import annotations

from alembic import op

revision = "4559f983ab43"
down_revision = "c08f88a64574"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_standalone_trace_started_at_status",
        "standalone_trace",
        ["started_at", "status"],
    )
    op.create_index(
        "ix_standalone_span_started_at_status_name",
        "standalone_span",
        ["started_at", "status", "name"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_standalone_span_started_at_status_name",
        table_name="standalone_span",
    )
    op.drop_index(
        "ix_standalone_trace_started_at_status",
        table_name="standalone_trace",
    )
