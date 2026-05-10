"""Verify each PG index from the c08f88a64574 trace migration is created
on the right table with the right access method.

These tests require a real Postgres connection. Skipped unless
``STANDALONE_TEST_POSTGRES_URL`` is set; the standalone CI workflow
(``standalone-ci.yml``) provides a postgres:16 service container so
this suite runs on every PR. SQLite has neither partitioned tables
nor the index types this PR cares about (BRIN, GIN, ``pg_trgm``), so
the suite is PG-only.

The earlier iteration of these tests asserted index *engagement* via
``EXPLAIN (FORMAT JSON)`` and a 1k-row uniform probe. That approach
broke the moment the migration moved to declarative partitioning:
on a partitioned parent, the planner shows the auto-named partition-
level index (``standalone_trace_202605_started_at_idx``), not the
parent index name the test was looking for. Worse, the GIN/trigram
probes inserted homogeneous data where every row matched the filter
so the planner correctly preferred a sequential scan over the index
(returning all rows).

Migration shape is the contract these tests guard. ``pg_indexes`` is
the right system catalog for that contract: parent indexes on
partitioned tables show up there with their declared names, and the
test stays robust as PG renames the per-partition copies.
"""

from __future__ import annotations

import os

import pytest
from idun_agent_standalone.db.migrate import (
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

    No synthetic data is loaded — the assertions below only inspect
    the index catalog, which the migration populates regardless of
    whether the table holds rows. Removing the 1k-row probe keeps the
    test suite fast and side-step the planner-selectivity confounder
    that broke the previous iteration.
    """
    url = os.environ["STANDALONE_TEST_POSTGRES_URL"]
    monkeypatch.setenv("DATABASE_URL", url)

    # Reset before upgrade so a previous test that crashed mid-run
    # can't leave dirty schema for this one. ``downgrade_base`` is a
    # no-op on an empty / unstamped database.
    downgrade_base()
    upgrade_head()
    sync_engine = create_engine(_sync_url(url))
    try:
        yield sync_engine
    finally:
        sync_engine.dispose()
        downgrade_base()


def _index_exists(
    engine, *, table: str, indexname: str, indexdef_contains: str | None = None
) -> bool:
    """Return True iff ``indexname`` exists on ``table`` in the public
    schema, optionally requiring a substring of the index DDL.

    The ``indexdef_contains`` check is what discriminates the GIN
    ``jsonb_path_ops`` from a default GIN, the ``pg_trgm``
    ``gin_trgm_ops`` from the same, and the descending B-tree from a
    plain ascending one.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' "
                "AND tablename = :tbl "
                "AND indexname = :name"
            ),
            {"tbl": table, "name": indexname},
        ).fetchone()
    if row is None:
        return False
    if indexdef_contains is not None:
        return indexdef_contains in row[0]
    return True


def test_descending_started_at_index_on_trace(pg_engine) -> None:
    """``standalone_trace_started_desc_idx`` is the B-tree the list
    handler relies on to pull the most-recent traces with a single
    ``ORDER BY started_at DESC LIMIT N`` scan.
    """
    assert _index_exists(
        pg_engine,
        table="standalone_trace",
        indexname="standalone_trace_started_desc_idx",
        indexdef_contains="started_at DESC",
    )


def test_attributes_jsonb_path_ops_index_on_span(pg_engine) -> None:
    """``standalone_span_attrs_gin_idx`` is the GIN ``jsonb_path_ops``
    index the attribute-filter queries (``attributes @> '{...}'``) hit.
    The ``jsonb_path_ops`` opclass is mandatory — a default GIN on
    ``jsonb`` does not engage on ``@>`` containment.
    """
    assert _index_exists(
        pg_engine,
        table="standalone_span",
        indexname="standalone_span_attrs_gin_idx",
        indexdef_contains="jsonb_path_ops",
    )


def test_pg_trgm_index_on_span_name(pg_engine) -> None:
    """``standalone_span_name_trgm_idx`` is the trigram GIN that powers
    ``name ILIKE '%foo%'`` free-text search on the spans table.
    """
    assert _index_exists(
        pg_engine,
        table="standalone_span",
        indexname="standalone_span_name_trgm_idx",
        indexdef_contains="gin_trgm_ops",
    )


def test_models_gin_index_on_trace(pg_engine) -> None:
    """``standalone_trace_models_gin_idx`` is the GIN over the
    ``models text[]`` column — engages on ``models @> ARRAY[...]``
    containment queries from the list endpoint's model filter.
    """
    assert _index_exists(
        pg_engine,
        table="standalone_trace",
        indexname="standalone_trace_models_gin_idx",
        indexdef_contains="USING gin (models)",
    )
