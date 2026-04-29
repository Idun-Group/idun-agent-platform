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
import os
import webbrowser
from pathlib import Path

import click
import uvicorn

from idun_agent_standalone.core.logging import get_logger, setup_logging
from idun_agent_standalone.core.settings import StandaloneSettings


@click.group()
def main() -> None:
    """Idun Agent Standalone CLI."""


@main.command("hash-password")
@click.option(
    "--password",
    "password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="Plaintext password to hash. Prompted if omitted.",
)
def hash_password_cmd(password: str) -> None:
    """Print a bcrypt hash suitable for IDUN_ADMIN_PASSWORD_HASH."""
    from idun_agent_standalone.core.security import hash_password

    click.echo(hash_password(password))


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
    asyncio.run(_serve(StandaloneSettings()))


@main.command("init")
@click.option(
    "--port",
    "port_override",
    type=int,
    default=None,
    help="Port to bind. Overrides IDUN_PORT (default 8000).",
)
@click.option(
    "--no-browser",
    "no_browser",
    is_flag=True,
    default=False,
    help="Don't open the browser automatically. Useful for Cloud Run + headless.",
)
def init_cmd(port_override: int | None, no_browser: bool) -> None:
    """Initialize Idun in the current folder and launch chat + admin.

    Runs DB migrations, seeds from ``config.yaml`` if present, opens the
    browser at ``http://<host>:<port>/``, then boots the standalone
    server. The browser handles the wizard-or-chat conditional: if an
    agent is configured the chat root renders, otherwise the wizard at
    ``/onboarding`` takes over.

    Idempotent: re-running on an already-initialized folder is safe and
    re-launches the server.
    """
    setup_logging()

    # Resolve port: --port flag > IDUN_PORT env > default 8000.
    if port_override is not None:
        os.environ["IDUN_PORT"] = str(port_override)

    settings = StandaloneSettings()

    # Migrations + seed (both no-op when already at head / DB has rows).
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    asyncio.run(_setup(config_path_override=None))

    # Open the browser BEFORE serve. _serve blocks the main thread; opening
    # after would require threading. Modern browsers retry connection-refused
    # for several seconds, giving uvicorn a window to come up.
    if not no_browser:
        webbrowser.open(f"http://{settings.host}:{settings.port}/")

    asyncio.run(_serve(settings))


async def _serve(settings: StandaloneSettings) -> None:
    """Build the app and serve it inside a single event loop.

    Calling ``asyncio.run`` to build the app and then ``uvicorn.run``
    creates two distinct loops; async resources (the SQLAlchemy engine,
    the LLM SDK's httpx pool, ``asyncio.Lock`` instances) bind to the
    first loop, then crash when the request path runs on the second.
    Building under ``uvicorn.Server.serve`` keeps everything on one loop.
    """
    from idun_agent_standalone.app import create_standalone_app

    logger = get_logger(__name__)
    logger.info("serve host=%s port=%s", settings.host, settings.port)

    app = await create_standalone_app(settings)
    config = uvicorn.Config(app, host=settings.host, port=settings.port)
    server = uvicorn.Server(config)
    await server.serve()


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
