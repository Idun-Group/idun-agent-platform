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


def run_server(
    *,
    config_path: str | None = None,
    host: str | None = None,
    port: int | None = None,
    auth_mode: str | None = None,
    ui_dir: str | None = None,
    database_url: str | None = None,
) -> None:
    """Boot the standalone process under uvicorn.

    CLI flags become env vars before settings are loaded, so the same
    resolution path drives both ``idun-standalone serve --port 9001`` and
    ``IDUN_PORT=9001 idun-standalone serve``.
    """
    import asyncio
    import os

    import uvicorn

    from idun_agent_standalone.app import create_standalone_app

    if config_path:
        os.environ["IDUN_CONFIG_PATH"] = config_path
    if host:
        os.environ["IDUN_HOST"] = host
    if port is not None:
        os.environ["IDUN_PORT"] = str(port)
    if auth_mode:
        os.environ["IDUN_ADMIN_AUTH_MODE"] = auth_mode
    if ui_dir:
        os.environ["IDUN_UI_DIR"] = ui_dir
    if database_url:
        os.environ["DATABASE_URL"] = database_url

    settings = StandaloneSettings()

    async def _build():
        return await create_standalone_app(settings)

    app = asyncio.run(_build())
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
