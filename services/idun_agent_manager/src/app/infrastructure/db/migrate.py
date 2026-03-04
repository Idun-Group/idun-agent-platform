"""Database migration utilities.

Provides an async wrapper to run Alembic migrations at app startup.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from time import perf_counter

from alembic.config import Config
from alembic.util.exc import CommandError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic import command

# Ordered from newest to oldest: (table_name, revision_that_created_it).
# Used to determine the closest known revision when the DB has an orphaned
# stamp (e.g. a migration file that was removed/consolidated).
_TABLE_REVISION_MAP: list[tuple[str, str]] = [
    ("project_resources", "a3c7e9f12b45"),
    ("projects", "a3c7e9f12b45"),
    ("managed_integrations", "4e21ee5d39eb"),
    ("managed_ssos", "6ba3b4227faa"),
    ("managed_guardrails", "5aa453389806"),
    ("managed_memories", "d06cbef64155"),
    ("managed_observabilities", "92b2983e3c1a"),
    ("managed_mcp_servers", "bdc4b198abf1"),
    ("workspaces", "a1b2c3d4e5f7"),
    ("managed_agents", "ff7f22c5cc78"),
]


def _sync_url(async_url: str) -> str:
    """Convert async DB URL to sync URL for Alembic/SQLAlchemy sync tools."""
    return async_url.replace("+asyncpg", "+psycopg").replace("+asyncio", "")


def _alembic_cfg(project_root: Path, db_url: str) -> Config:
    cfg = Config(str(project_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(project_root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def _resolve_orphaned_revision(db_url: str, logger: logging.Logger) -> None:
    """Detect actual DB state via table inspection and stamp the correct revision.

    When the alembic_version table contains a revision that no longer has a
    corresponding migration file (e.g. after a squash/consolidation), Alembic
    cannot compute the upgrade path.  This function inspects which tables
    actually exist and directly overwrites the alembic_version row with the
    latest matching known revision so that subsequent ``upgrade head`` calls
    succeed.

    Uses direct SQL for stamping because ``alembic stamp`` also fails when the
    current DB revision is orphaned (it tries to resolve the existing stamp).
    """
    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        # Walk newest→oldest; first match = latest revision the DB is at or past
        target_revision: str | None = None
        for table_name, revision in _TABLE_REVISION_MAP:
            if table_name in existing_tables:
                target_revision = revision
                break

        with engine.begin() as conn:
            if target_revision is None:
                # DB has alembic_version but no managed tables → start fresh
                logger.warning(
                    "No known tables found; clearing alembic_version to re-run from base"
                )
                conn.execute(text("DELETE FROM alembic_version"))
            else:
                logger.info(
                    "Stamping DB at revision %s based on table inspection",
                    target_revision,
                )
                # Direct SQL: overwrite the orphaned stamp with the resolved one.
                conn.execute(text("DELETE FROM alembic_version"))
                conn.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:rev)"),
                    {"rev": target_revision},
                )
    finally:
        engine.dispose()


def _run_alembic_upgrade_head(db_url: str, project_root: Path) -> None:
    """Run Alembic upgrade to head using the given DB URL and project root.

    If the DB has an orphaned revision (migration file removed), resolve it
    via table inspection, stamp the correct revision, and retry.
    """
    logger = logging.getLogger("app.migrate")
    cfg = _alembic_cfg(project_root, db_url)

    try:
        command.upgrade(cfg, "head")
    except CommandError as exc:
        if "Can't locate revision" not in str(exc):
            raise

        # Extract the orphaned revision for logging
        match = re.search(r"Can't locate revision identified by '([^']+)'", str(exc))
        orphan_id = match.group(1) if match else "unknown"
        logger.warning(
            "Orphaned revision '%s' in alembic_version; resolving via table inspection",
            orphan_id,
        )

        _resolve_orphaned_revision(db_url, logger)

        # Retry upgrade with the corrected stamp
        cfg = _alembic_cfg(project_root, db_url)
        command.upgrade(cfg, "head")


async def auto_migrate(
    engine: AsyncEngine,
    *,
    async_db_url: str,
    project_root: Path,
    enable_migrate: bool,
) -> None:
    """Run Alembic migrations if enabled.

    Uses a Postgres advisory lock with a small timeout to avoid startup hangs
    when multiple processes start concurrently during development.
    """
    if not enable_migrate:
        return

    # Try to acquire an advisory lock (non-blocking with short retry)
    lock_key = 72727272
    max_wait_seconds = 30
    poll_interval_seconds = 0.5

    from anyio import fail_after, sleep, to_thread

    logger = logging.getLogger("app.migrate")

    acquired = False
    async with engine.begin() as conn:
        logger.info("Acquiring migration lock")
        waited = 0.0
        while waited < max_wait_seconds:
            row = await conn.execute(text(f"SELECT pg_try_advisory_lock({lock_key})"))
            got = bool(row.scalar())
            if got:
                acquired = True
                break
            await sleep(poll_interval_seconds)
            waited += poll_interval_seconds

        try:
            if not acquired:
                # Skip to keep startup responsive in dev if lock can't be acquired
                logger.warning(
                    "Could not acquire migration lock within timeout; skipping",
                    extra={"waited_seconds": waited},
                )
                return

            # Run Alembic in a worker thread (sync-only)
            logger.info("Running Alembic upgrade head")
            start = perf_counter()
            try:
                # Safety timeout to avoid indefinite waits
                with fail_after(120):
                    await to_thread.run_sync(
                        _run_alembic_upgrade_head, _sync_url(async_db_url), project_root
                    )
            finally:
                elapsed_ms = (perf_counter() - start) * 1000
                logger.info(
                    "Alembic upgrade finished",
                    extra={"elapsed_ms": round(elapsed_ms, 2)},
                )
        finally:
            if acquired:
                await conn.execute(text(f"SELECT pg_advisory_unlock({lock_key})"))
                logger.info("Released migration lock")
