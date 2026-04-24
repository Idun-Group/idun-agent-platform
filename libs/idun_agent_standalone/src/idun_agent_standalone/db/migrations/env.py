"""Alembic environment for idun-agent-standalone.

Reads the database URL from ``DATABASE_URL`` (consistent with the runtime
``StandaloneSettings``). Supports both online (live engine) and offline
(SQL emit) modes; the live engine variant uses an async driver.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from idun_agent_standalone.db import models  # noqa: F401  (register models)
from idun_agent_standalone.db.base import Base
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return os.environ.get("DATABASE_URL") or "sqlite+aiosqlite:///./idun_standalone.db"


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        {"sqlalchemy.url": _url()},
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
