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
import sys
import webbrowser
from enum import StrEnum
from pathlib import Path

import click
import uvicorn
from dotenv import load_dotenv

from idun_agent_standalone._telemetry import track_command
from idun_agent_standalone.core.logging import get_logger, setup_logging
from idun_agent_standalone.core.settings import StandaloneSettings


def _load_project_env() -> None:
    """Load a ``.env`` file from the current working directory if present.

    The wizard's Done screen and the scaffolder's ``.env.example`` both
    tell users to drop their LLM credentials in a project-local ``.env``
    and re-run the CLI. Without this load step that promise breaks —
    ``StandaloneSettings`` is configured ``env_file=None`` and the
    engine's agent code reads ``os.environ.get(...)`` directly. Override
    is False so an explicit shell export still wins over the file.

    ``load_dotenv()`` with no args walks up from the calling file's
    directory, which lands somewhere inside the installed package.
    Pass cwd explicitly so the search anchors on the user's project
    folder instead.
    """
    load_dotenv(Path.cwd() / ".env", override=False)


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
@track_command("hash-password")
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
@track_command("setup")
def setup_cmd(config_path_override: str | None) -> None:
    """Create DB schema and seed from YAML if the DB is empty."""
    setup_logging()
    _load_project_env()
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    asyncio.run(_setup(config_path_override))


@main.command("serve")
@track_command("serve")
def serve_cmd() -> None:
    """Run the standalone server (engine routes plus admin REST)."""
    setup_logging()
    _load_project_env()
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
@track_command("init")
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
    # Load `.env` BEFORE constructing settings so IDUN_HOST / IDUN_PORT /
    # DATABASE_URL declared in the file are honored by StandaloneSettings.
    _load_project_env()

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
        # Wildcard bind addresses (0.0.0.0 / ::) are server-side; browsers
        # can't navigate to them reliably. Map to localhost for the URL
        # only — the server still binds wherever IDUN_HOST says.
        browser_host = (
            "127.0.0.1" if settings.host in ("0.0.0.0", "::", "") else settings.host
        )
        webbrowser.open(f"http://{browser_host}:{settings.port}/")

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


class _ServerSource(StrEnum):
    MANAGER = "manager"
    FILE = "file"


class _AgentServe:
    def __init__(self, source: _ServerSource, path: str | None = None) -> None:
        from idun_agent_engine.core.config_builder import ConfigBuilder
        from idun_agent_engine.core.engine_config import EngineConfig
        from idun_agent_engine.core.utils import print_banner

        setup_logging()
        print_banner()

        self._source = source
        self._path = path or None

        if self._source == _ServerSource.MANAGER and (
            not os.getenv("IDUN_AGENT_API_KEY") or not os.getenv("IDUN_MANAGER_HOST")
        ):
            get_logger(__name__).error(
                "IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST not found. Both env "
                "variables are required for `manager` source."
            )
            sys.exit(1)

        if self._source == _ServerSource.MANAGER:
            self._url = os.environ["IDUN_MANAGER_HOST"]
            self._agent_api_key = os.environ["IDUN_AGENT_API_KEY"]

        self._builder_cls = ConfigBuilder
        self._config: EngineConfig | None = self._resolve_source()

    def _resolve_source(self):
        logger = get_logger(__name__)
        if self._source == _ServerSource.MANAGER:
            logger.info("Fetching config from the manager...")
            return self._fetch_from_manager()
        elif self._source == _ServerSource.FILE:
            logger.info(f"Building config from: {self._path}")
            return self._fetch_from_path()

    def _fetch_from_path(self):
        try:
            config = self._builder_cls().load_from_file(self._path or "")
            get_logger(__name__).info(
                f"✅ Successfully fetched and built config from {self._path}"
            )
            return config
        except Exception as e:
            raise ValueError(f"Cannot fetch config from {self._path}: {e}") from e

    def _fetch_from_manager(self):
        logger = get_logger(__name__)
        try:
            config = (
                self._builder_cls()
                .with_config_from_api(
                    agent_api_key=self._agent_api_key, url=self._url
                )
                .build()
            )
            logger.info(f"✅ Successfully fetched and built config from {self._url}")
            return config
        except Exception as e:
            logger.error(f"Cannot fetch config from {self._url}: {e}")
            sys.exit(1)

    def serve(self) -> None:
        from idun_agent_engine.core.app_factory import create_app
        from idun_agent_engine.core.server_runner import run_server

        try:
            app = create_app(engine_config=self._config)
            run_server(app, port=self._config.server.api.port, reload=False)  # pyright: ignore
        except Exception as e:
            raise ValueError(f"[ERROR]: Cannot start the agent server: {e}") from e


@main.group("agent")
def agent_group() -> None:
    """Run agents from a config (manager API or local file)."""


@agent_group.command("serve")
@click.option(
    "--source",
    type=click.Choice([s.value for s in _ServerSource]),
    required=True,
    help=(
        "Where the agent config comes from. "
        "'manager' fetches from the hosted API "
        "(needs IDUN_AGENT_API_KEY and IDUN_MANAGER_HOST). "
        "'file' loads a local config.yaml (needs --path)."
    ),
)
@click.option(
    "--path",
    type=click.Path(),
    help="Path to a local config.yaml. Required when --source=file.",
)
@track_command("agent.serve")
def agent_serve_cmd(source: str, path: str | None) -> None:
    """Serve an agent from a manager or file source."""
    logger = get_logger(__name__)
    match source:
        case _ServerSource.MANAGER:
            _AgentServe(source=_ServerSource.MANAGER).serve()
        case _ServerSource.FILE:
            if not path:
                logger.error(
                    "No config path provided. Specify the path of your config.yaml"
                )
                sys.exit(1)
            _AgentServe(source=_ServerSource.FILE, path=path).serve()
        case _:
            logger.error(f"Argument {source} not recognized.")
            sys.exit(1)
