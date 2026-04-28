"""Command line entry point for ``idun-standalone``.

Two commands.

``setup`` creates the standalone DB schema and seeds the agent and
memory rows from a YAML config if the DB is empty. Operator invoked
once before the first ``serve``. ``--config PATH`` overrides
``IDUN_CONFIG_PATH``.

``serve`` runs the FastAPI app under uvicorn. The engine routes and
the admin REST surface live on the same FastAPI instance and share
the same event loop. Settings come from env so the same command line
works in dev, laptop, and Cloud Run without flag wrangling.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
import uvicorn

from idun_agent_standalone.core.logging import get_logger, setup_logging
from idun_agent_standalone.core.settings import StandaloneSettings


@click.group()
def main() -> None:
    """Idun Agent Standalone CLI."""


@main.command("setup")
@click.option(
    "--config",
    "config_path_override",
    type=click.Path(),
    default=None,
    help="Path to YAML config. Overrides IDUN_CONFIG_PATH.",
)
def setup_cmd(config_path_override: str | None) -> None:
    """Create DB schema and seed from YAML if the DB is empty."""
    setup_logging()
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    asyncio.run(_setup(config_path_override))


@main.command("serve")
def serve_cmd() -> None:
    """Run the standalone server (engine routes plus admin REST)."""
    setup_logging()
    from idun_agent_standalone.app import create_standalone_app

    logger = get_logger(__name__)
    settings = StandaloneSettings()
    logger.info("serve host=%s port=%s", settings.host, settings.port)

    app = asyncio.run(create_standalone_app(settings))
    uvicorn.run(app, host=settings.host, port=settings.port)


async def _setup(config_path_override: str | None) -> None:
    from idun_agent_standalone.infrastructure.db.session import (
        create_db_engine,
        create_sessionmaker,
    )
    from idun_agent_standalone.infrastructure.scripts.seed import (
        seed_from_yaml_if_empty,
    )

    logger = get_logger(__name__)
    settings = StandaloneSettings()
    config_path = (
        Path(config_path_override) if config_path_override else settings.config_path
    )
    logger.info(
        "setup start db_url=%s config_path=%s",
        settings.database_url,
        config_path,
    )

    db_engine = create_db_engine(settings.database_url)
    sessionmaker = create_sessionmaker(db_engine)
    try:
        await seed_from_yaml_if_empty(sessionmaker, config_path)
    finally:
        await db_engine.dispose()

    logger.info("setup complete")
