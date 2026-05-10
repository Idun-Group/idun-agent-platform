"""Up/down/re-up Alembic smoke for the trace tables migration.

Mirrors the working pattern from
~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/17-alembic-partitioning-reference.md.

The standalone Alembic ``env.py`` calls ``asyncio.run`` inside its online
path, so these tests stay sync (matching ``test_migrations.py``) and
drive Alembic via env-var + the packaged config — running an
``async def`` test that calls ``command.upgrade`` would nest event loops
and ``RuntimeError`` out.
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
from sqlalchemy import create_engine, inspect, text


def _sync_url(url: str) -> str:
    """Return a sync-driver variant for inspection-only connections."""
    return (
        url.replace("sqlite+aiosqlite", "sqlite")
        .replace("postgresql+asyncpg", "postgresql+psycopg")
        .replace("postgresql+psycopg2", "postgresql+psycopg")
    )


def test_sqlite_migration_up_down_reup(tmp_path, monkeypatch) -> None:
    """SQLite: upgrade head -> downgrade -1 -> upgrade head clean."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'trace.db'}"
    monkeypatch.setenv("DATABASE_URL", url)

    upgrade_head()

    inspect_engine = create_engine(_sync_url(url))
    try:
        with inspect_engine.connect() as conn:
            tables = set(inspect(conn).get_table_names())
        assert "standalone_trace" in tables
        assert "standalone_span" in tables

        # Downgrade one revision and re-upgrade to head must succeed.
        command.downgrade(_alembic_config(), "-1")
        with inspect_engine.connect() as conn:
            tables_after_down = set(inspect(conn).get_table_names())
        assert "standalone_trace" not in tables_after_down
        assert "standalone_span" not in tables_after_down

        upgrade_head()
        with inspect_engine.connect() as conn:
            tables_reup = set(inspect(conn).get_table_names())
        assert "standalone_trace" in tables_reup
        assert "standalone_span" in tables_reup
    finally:
        inspect_engine.dispose()
        # Leave the DB in a clean state for the next test.
        downgrade_base()


@pytest.mark.skipif(
    not os.getenv("STANDALONE_TEST_POSTGRES_URL"),
    reason="STANDALONE_TEST_POSTGRES_URL not set; PG migration smoke skipped",
)
def test_pg_migration_up_down_reup(monkeypatch) -> None:
    """Postgres: upgrade head -> downgrade -1 -> upgrade head clean.

    Verifies that ``standalone_trace`` and ``standalone_span`` are
    declared as partitioned tables (visible in ``pg_partitioned_table``).
    """
    url = os.environ["STANDALONE_TEST_POSTGRES_URL"]
    monkeypatch.setenv("DATABASE_URL", url)

    try:
        upgrade_head()

        inspect_engine = create_engine(_sync_url(url))
        try:
            with inspect_engine.connect() as conn:
                tables = set(inspect(conn).get_table_names())
            assert "standalone_trace" in tables
            assert "standalone_span" in tables

            with inspect_engine.connect() as conn:
                result = conn.execute(
                    text(
                        "SELECT c.relname FROM pg_partitioned_table pt "
                        "JOIN pg_class c ON pt.partrelid = c.oid"
                    )
                )
                partitioned = {row[0] for row in result}
            assert "standalone_trace" in partitioned
            assert "standalone_span" in partitioned

            command.downgrade(_alembic_config(), "-1")
            upgrade_head()
        finally:
            inspect_engine.dispose()
    finally:
        downgrade_base()
