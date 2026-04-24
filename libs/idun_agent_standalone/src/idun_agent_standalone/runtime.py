"""Runtime helpers used by the CLI.

Phase 3 implements the YAML <-> DB sync helpers (``export_to_yaml_sync`` and
``import_from_yaml_sync``). ``run_server`` is wired in Phase 6 once the full
app factory composes engine + admin + traces.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from idun_agent_standalone.config_io import (
    export_db_as_yaml,
    reset_and_seed_from_yaml,
)
from idun_agent_standalone.db.base import create_db_engine, create_sessionmaker
from idun_agent_standalone.settings import StandaloneSettings


def _make_db():
    s = StandaloneSettings()
    engine = create_db_engine(s.database_url)
    return engine, create_sessionmaker(engine)


def export_to_yaml_sync() -> str:
    async def _run() -> str:
        engine, sm = _make_db()
        try:
            async with sm() as session:
                return await export_db_as_yaml(session)
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def import_from_yaml_sync(file: str) -> None:
    async def _run() -> None:
        engine, sm = _make_db()
        try:
            async with sm() as session:
                await reset_and_seed_from_yaml(session, Path(file))
                await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_run())


def run_server(**kwargs: object) -> None:
    """Phase 6 wires this up; until then ``idun-standalone serve`` is a stub."""
    raise NotImplementedError(
        "`idun-standalone serve` will be implemented in Phase 6 of the MVP plan."
    )
