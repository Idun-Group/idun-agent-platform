"""Database migration utilities.

Provides an async wrapper to run Alembic migrations at app startup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from time import perf_counter

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic import command
from alembic.config import Config


def _sync_url(async_url: str) -> str:
    """Convert async DB URL to sync URL for Alembic/SQLAlchemy sync tools."""
    return async_url.replace("+asyncpg", "+psycopg").replace("+asyncio", "")


def _run_alembic_upgrade_head(db_url: str, project_root: Path) -> None:
    """Run Alembic upgrade to head using the given DB URL and project root."""
    cfg = Config(str(project_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(project_root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
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
