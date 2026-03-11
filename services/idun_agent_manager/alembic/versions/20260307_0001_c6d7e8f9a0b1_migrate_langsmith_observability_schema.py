"""Migrate LangSmith observability schema: remove unused fields.

Removes project_id, trace_name, tracing_enabled, capture_inputs_outputs
from LangSmith observability JSONB configs in managed_observabilities
and managed_agents tables.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-03-07 00:01:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: str | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Clean up managed_observabilities table
    op.execute(
        sa.text("""
            UPDATE managed_observabilities
            SET observability_config = jsonb_set(
                observability_config,
                '{config}',
                (observability_config->'config')
                    - 'projectId' - 'traceName' - 'tracingEnabled' - 'captureInputsOutputs'
                    - 'project_id' - 'trace_name' - 'tracing_enabled' - 'capture_inputs_outputs'
            )
            WHERE observability_config->>'provider' = 'LANGSMITH'
              AND observability_config->'config' IS NOT NULL
        """)
    )

    # Clean up managed_agents engine_config -> observability array
    op.execute(
        sa.text("""
            UPDATE managed_agents
            SET engine_config = jsonb_set(
                engine_config,
                '{observability}',
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN elem->>'provider' = 'LANGSMITH' THEN
                                jsonb_set(
                                    elem,
                                    '{config}',
                                    (elem->'config')
                                        - 'projectId' - 'traceName' - 'tracingEnabled' - 'captureInputsOutputs'
                                        - 'project_id' - 'trace_name' - 'tracing_enabled' - 'capture_inputs_outputs'
                                )
                            ELSE elem
                        END
                    )
                    FROM jsonb_array_elements(engine_config->'observability') AS elem
                )
            )
            WHERE engine_config->'observability' IS NOT NULL
              AND engine_config->'observability' @> '[{"provider": "LANGSMITH"}]'
        """)
    )


def downgrade() -> None:
    # No-op: removed fields had defaults; old code uses Pydantic defaults.
    pass
