"""Add standalone_trace + standalone_span tables.

Revision ID: c08f88a64574
Revises: 73f9ed38d018
Create Date: 2026-05-09

Locked design:
    ~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/09-postgres-schema.md
Sharp edges:
    ~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/17-alembic-partitioning-reference.md

Three sharp edges captured upstream:

1. ``op.create_table()`` silently breaks on partitioned tables -- the
   ``PARTITION BY RANGE`` clause must be expressed via raw
   ``op.execute("CREATE TABLE ...")``.
2. The PK on a partitioned table must include the partition key first.
3. ``DEFAULT`` partition is silently greedy -- on downgrade, drop the
   parent table with ``CASCADE`` so all attached partitions go away in
   one shot rather than relying on per-partition order.
"""

from __future__ import annotations

from datetime import UTC, datetime

from alembic import op
from dateutil.relativedelta import relativedelta  # type: ignore[import-untyped]

# Revision identifiers, used by Alembic.
revision: str = "c08f88a64574"
down_revision: str | None = "73f9ed38d018"
branch_labels: str | None = None
depends_on: str | None = None


def _pg_upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    op.execute(
        """
        CREATE TABLE standalone_trace (
            started_at      timestamptz NOT NULL,
            otel_trace_id   bytea       NOT NULL,
            name            text        NOT NULL,
            user_id         text,
            session_id      text,
            ended_at        timestamptz,
            status          text,
            latency_ms      numeric,
            total_tokens    bigint,
            total_cost_usd  numeric(20, 10),
            models          text[],
            tags            text[],
            metadata        jsonb,
            PRIMARY KEY (started_at, otel_trace_id)
        ) PARTITION BY RANGE (started_at);
        """
    )

    op.execute(
        """
        CREATE TABLE standalone_trace_default
            PARTITION OF standalone_trace DEFAULT;
        """
    )

    op.execute(
        """
        CREATE TABLE standalone_span (
            started_at         timestamptz NOT NULL,
            otel_span_id       bytea       NOT NULL,
            otel_trace_id      bytea       NOT NULL,
            parent_span_id     bytea,
            name               text        NOT NULL,
            kind               text        NOT NULL,
            ended_at           timestamptz,
            latency_ms         numeric,
            model              text,
            provider           text,
            prompt_tokens      bigint,
            completion_tokens  bigint,
            cache_read_tokens  bigint,
            cache_write_tokens bigint,
            total_tokens       bigint
                GENERATED ALWAYS AS (
                    COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)
                ) STORED,
            cost_usd           numeric(20, 10),
            cost_breakdown     jsonb,
            cost_source        text,
            status             text,
            attributes         jsonb,
            events             jsonb,
            PRIMARY KEY (started_at, otel_span_id)
        ) PARTITION BY RANGE (started_at);
        """
    )

    op.execute(
        """
        CREATE TABLE standalone_span_default
            PARTITION OF standalone_span DEFAULT;
        """
    )

    # Pre-create current month + next 3 monthly partitions for both tables.
    today = datetime.now(UTC).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    for tbl in ("standalone_trace", "standalone_span"):
        for i in range(0, 4):
            start = today + relativedelta(months=i)
            end = start + relativedelta(months=1)
            tag = start.strftime("%Y%m")
            op.execute(
                f"""
                CREATE TABLE {tbl}_{tag}
                    PARTITION OF {tbl}
                    FOR VALUES FROM ('{start.isoformat()}')
                                  TO ('{end.isoformat()}');
                """
            )

    # Indexes on the parent (PG propagates them to attached partitions).
    op.execute(
        "CREATE INDEX standalone_trace_started_desc_idx "
        "ON standalone_trace (started_at DESC);"
    )
    op.execute(
        "CREATE INDEX standalone_trace_started_brin_idx "
        "ON standalone_trace USING BRIN (started_at);"
    )
    op.execute(
        "CREATE INDEX standalone_trace_metadata_gin_idx "
        "ON standalone_trace USING GIN (metadata jsonb_path_ops);"
    )
    op.execute(
        "CREATE INDEX standalone_trace_models_gin_idx "
        "ON standalone_trace USING GIN (models);"
    )

    op.execute(
        "CREATE INDEX standalone_span_started_desc_idx "
        "ON standalone_span (started_at DESC);"
    )
    op.execute(
        "CREATE INDEX standalone_span_started_brin_idx "
        "ON standalone_span USING BRIN (started_at);"
    )
    op.execute(
        "CREATE INDEX standalone_span_attrs_gin_idx "
        "ON standalone_span USING GIN (attributes jsonb_path_ops);"
    )
    op.execute(
        "CREATE INDEX standalone_span_name_trgm_idx "
        "ON standalone_span USING GIN (name gin_trgm_ops);"
    )
    op.execute(
        "CREATE INDEX standalone_span_parent_idx "
        "ON standalone_span (parent_span_id);"
    )


def _pg_downgrade() -> None:
    # Drop span before trace (matches the locked DDL ordering).
    # CASCADE removes attached partitions atomically.
    op.execute("DROP TABLE IF EXISTS standalone_span CASCADE;")
    op.execute("DROP TABLE IF EXISTS standalone_trace CASCADE;")


def _sqlite_upgrade() -> None:
    op.execute(
        """
        CREATE TABLE standalone_trace (
            started_at      TEXT    NOT NULL,
            otel_trace_id   BLOB    NOT NULL,
            name            TEXT    NOT NULL,
            user_id         TEXT,
            session_id      TEXT,
            ended_at        TEXT,
            status          TEXT,
            latency_ms      TEXT,
            total_tokens    INTEGER,
            total_cost_usd  TEXT,
            models          TEXT,
            tags            TEXT,
            metadata        TEXT,
            PRIMARY KEY (started_at, otel_trace_id)
        );
        """
    )
    op.execute(
        """
        CREATE TABLE standalone_span (
            started_at         TEXT    NOT NULL,
            otel_span_id       BLOB    NOT NULL,
            otel_trace_id      BLOB    NOT NULL,
            parent_span_id     BLOB,
            name               TEXT    NOT NULL,
            kind               TEXT    NOT NULL,
            ended_at           TEXT,
            latency_ms         TEXT,
            model              TEXT,
            provider           TEXT,
            prompt_tokens      INTEGER,
            completion_tokens  INTEGER,
            cache_read_tokens  INTEGER,
            cache_write_tokens INTEGER,
            total_tokens       INTEGER,
            cost_usd           TEXT,
            cost_breakdown     TEXT,
            cost_source        TEXT,
            status             TEXT,
            attributes         TEXT,
            events             TEXT,
            PRIMARY KEY (started_at, otel_span_id)
        );
        """
    )
    op.execute(
        "CREATE INDEX standalone_trace_started_idx "
        "ON standalone_trace (started_at DESC);"
    )
    op.execute(
        "CREATE INDEX standalone_span_started_idx "
        "ON standalone_span (started_at DESC);"
    )
    op.execute(
        "CREATE INDEX standalone_span_parent_idx "
        "ON standalone_span (parent_span_id);"
    )
    op.execute(
        "CREATE INDEX standalone_span_name_idx ON standalone_span (name);"
    )


def _sqlite_downgrade() -> None:
    # Drop span before trace (matches the locked DDL ordering).
    op.execute("DROP TABLE IF EXISTS standalone_span;")
    op.execute("DROP TABLE IF EXISTS standalone_trace;")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _pg_upgrade()
    elif bind.dialect.name == "sqlite":
        _sqlite_upgrade()
    else:
        raise RuntimeError(f"Unsupported dialect: {bind.dialect.name}")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _pg_downgrade()
    elif bind.dialect.name == "sqlite":
        _sqlite_downgrade()
    else:
        raise RuntimeError(f"Unsupported dialect: {bind.dialect.name}")
