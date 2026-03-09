import os
import sys
from enum import StrEnum

import click

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.core.logging import get_logger, setup_logging
from idun_agent_engine.core.server_runner import run_server
from idun_agent_engine.core.utils import print_banner
from idun_platform_cli.telemetry import track_command

logger = get_logger(__name__)


class ServerSource(StrEnum):
    """Enum for source types."""

    MANAGER = "manager"
    FILE = "file"


class Serve:
    """Helper class to run the server."""

    def __init__(self, source: ServerSource, path: str | None = None) -> None:
        setup_logging()
        print_banner()

        self._source: ServerSource = source
        self._path: str | None = path or None

        if self._source == ServerSource.MANAGER and (
            not os.getenv("IDUN_AGENT_API_KEY") or not os.getenv("IDUN_MANAGER_HOST")
        ):
            logger.error(
                "IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST not found. Both env variables are required for `manager` source."
            )
            sys.exit(1)

        if self._source == ServerSource.MANAGER:
            self._url: str = os.environ["IDUN_MANAGER_HOST"]
            self._agent_api_key: str = os.environ["IDUN_AGENT_API_KEY"]

        self._config: EngineConfig | None = self._resolve_source()

    def _resolve_source(self):
        """Returns the EngineConfig based on the type of the source."""
        if self._source == ServerSource.MANAGER:
            logger.info("Fetching config from the manager...")
            return self._fetch_from_manager()
        elif self._source == ServerSource.FILE:
            logger.info(f"Building config from: {self._path}")
            return self._fetch_from_path()

    def _fetch_from_path(self) -> EngineConfig | None:
        try:
            config = ConfigBuilder().load_from_file(self._path or "")
            logger.info(f"✅ Successfully fetched and built config from {self._path}")
            return config

        except Exception as e:
            raise ValueError(f"Cannot fetch config from {self._path}: {e}") from e

    def _fetch_from_manager(self) -> EngineConfig | None:
        """Fetches the config from the api."""
        try:
            config = (
                ConfigBuilder()
                .with_config_from_api(agent_api_key=self._agent_api_key, url=self._url)
                .build()
            )
            logger.info(f"✅ Successfully fetched and built config from {self._url}")
            return config
        except Exception as e:
            logger.error(f"Cannot fetch config from {self._url}: {e}")
            sys.exit(1)

    def serve(self) -> None:
        """Run the server using the idun engine."""
        try:
            app = create_app(engine_config=self._config)
            run_server(app, port=self._config.server.api.port, reload=False)  # pyright: ignore
        except Exception as e:
            raise ValueError(f"[ERROR]: Cannot start the agent server: {e}") from e


@click.command("serve")
@click.option("--source", required=True)
@click.option("--path")
@track_command("agent serve")
def serve_command(source: str, path: str | None):
    """Reads a config and exposes it's agent as an API. Config is either fetched from the manager, or from a path.

    Note: Fetching from the manager requires env vars: IDUN_AGENT_API_KEY and IDUN_MANAGER_HOST.
    """
    match source:
        case ServerSource.MANAGER:
            s = Serve(source=source)
            s.serve()

        case ServerSource.FILE:
            if not path:
                logger.error(
                    "No config path provided. Specify the path of your config.yaml"
                )
                sys.exit(1)
            s = Serve(source=source, path=path)
            s.serve()
        case _:
            logger.error(f"Argument {source} not recognized.")
            sys.exit(1)
