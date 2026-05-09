"""Verify each PG index actually engages on representative queries.

These tests require a real Postgres connection -- they introspect the
query planner via ``EXPLAIN (FORMAT JSON)``. SQLite has no equivalent
plan-introspection surface for the indexes we care about (BRIN, GIN,
``pg_trgm``), so the suite is PG-only.

Skipped unless ``STANDALONE_TEST_POSTGRES_URL`` is set. The test
harness (CI fixture / docker compose / testcontainers) is intentionally
out of scope for this PR -- when the fixture lands, these tests will
auto-engage.
"""

from __future__ import annotations

import os

import pytest
from alembic import command
from idun_agent_standalone.db.migrate import (
    _alembic_config,
    downgrade_base,
    upgrade_head,
)
from sqlalchemy import create_engine, text

pytestmark = pytest.mark.skipif(
    not os.getenv("STANDALONE_TEST_POSTGRES_URL"),
    reason="STANDALONE_TEST_POSTGRES_URL not set; PG index probe skipped",
)


def _sync_url(url: str) -> str:
    return url.replace("postgresql+asyncpg", "postgresql+psycopg").replace(
        "postgresql+psycopg2", "postgresql+psycopg"
    )


@pytest.fixture()
def pg_engine(monkeypatch):
    """Bring the trace schema up against the configured PG instance.

    A synthetic 1k-row probe is loaded so the planner picks the indexed
    paths -- on an empty table PG often prefers a sequential scan even
    when an index exists.
    """
    url = os.environ["STANDALONE_TEST_POSTGRES_URL"]
    monkeypatch.setenv("DATABASE_URL", url)

    upgrade_head()
    sync_engine = create_engine(_sync_url(url))
    try:
        with sync_engine.begin() as conn:
            # Synthetic 1k-row probe -- enough to convince the planner
            # to use the indexes under test.
            conn.execute(
                text(
                    """
                    INSERT INTO standalone_trace (
                        started_at, otel_trace_id, name, models, metadata
                    )
                    SELECT
                        NOW() - (gs * INTERVAL '1 second'),
                        decode(lpad(to_hex(gs), 32, '0'), 'hex'),
                        'probe-' || gs,
                        ARRAY['gpt-4o', 'claude-3.5-sonnet']::text[],
                        jsonb_build_object('openinference.span.kind', 'LLM')
                    FROM generate_series(1, 1000) AS gs;
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO standalone_span (
                        started_at, otel_span_id, otel_trace_id, name, kind,
                        attributes
                    )
                    SELECT
                        NOW() - (gs * INTERVAL '1 second'),
                        decode(lpad(to_hex(gs), 16, '0'), 'hex'),
                        decode(lpad(to_hex(gs), 16, '0'), 'hex'),
                        'invoke-' || gs,
                        'LLM',
                        jsonb_build_object('openinference.span.kind', 'LLM')
                    FROM generate_series(1, 1000) AS gs;
                    """
                )
            )
            conn.execute(text("ANALYZE standalone_trace;"))
            conn.execute(text("ANALYZE standalone_span;"))
        yield sync_engine
    finally:
        sync_engine.dispose()
        # Roll back the schema so the next test starts clean.
        try:
            command.downgrade(_alembic_config(), "-1")
        finally:
            downgrade_base()


def _explain(engine, query: str) -> str:
    with engine.connect() as conn:
        plan = conn.execute(text(f"EXPLAIN (FORMAT JSON) {query}"))
        return str(plan.scalar())


def test_descending_started_at_index(pg_engine) -> None:
    plan = _explain(
        pg_engine,
        "SELECT * FROM standalone_trace ORDER BY started_at DESC LIMIT 100",
    )
    assert "standalone_trace_started_desc_idx" in plan, plan


def test_attributes_jsonb_path_ops_index(pg_engine) -> None:
    plan = _explain(
        pg_engine,
        "SELECT * FROM standalone_span "
        "WHERE attributes @> '{\"openinference.span.kind\": \"LLM\"}'::jsonb",
    )
    assert "standalone_span_attrs_gin_idx" in plan, plan


def test_pg_trgm_index_on_span_name(pg_engine) -> None:
    plan = _explain(
        pg_engine,
        "SELECT * FROM standalone_span WHERE name ILIKE '%invoke%'",
    )
    assert "standalone_span_name_trgm_idx" in plan, plan


def test_models_gin_index_on_trace(pg_engine) -> None:
    plan = _explain(
        pg_engine,
        "SELECT * FROM standalone_trace "
        "WHERE models @> ARRAY['gpt-4o']::text[]",
    )
    assert "standalone_trace_models_gin_idx" in plan, plan
