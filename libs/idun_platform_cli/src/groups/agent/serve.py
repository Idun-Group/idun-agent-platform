import os
import sys
from enum import StrEnum

import click
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.core.server_runner import run_server


class ServerSource(StrEnum):
    """Enum for source types."""

    MANAGER = "manager"
    FILE = "file"


class Serve:
    """Helper class to run the server."""

    def __init__(self, source: ServerSource, path: str | None = "") -> None:
        self._source: ServerSource = source
        self._path: str | None = path if path else None

        if self._source == ServerSource.MANAGER and (
            not os.getenv("IDUN_AGENT_API_KEY") or not os.getenv("IDUN_MANAGER_HOST")
        ):
            print(
                "[ERROR]: either IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST are not found. Make sure you add them both to your env variables, as `manager` source requires both."
            )
            sys.exit(1)

        if self._source == ServerSource.MANAGER:
            self._url: str = os.environ["IDUN_MANAGER_HOST"]
            self._agent_api_key: str = os.environ["IDUN_AGENT_API_KEY"]

        self._config: EngineConfig | None = self._resolve_source()

    def _resolve_source(self):
        """Returns the EngineConfig based on the type of the source."""
        if self._source == ServerSource.MANAGER:
            print("Getting the config for the manager...")
            return self._fetch_from_manager()
        elif self._source == ServerSource.FILE:
            print(f"Building config from: {self._path}")
            return self._fetch_from_path()

    def _fetch_from_path(self) -> EngineConfig | None:
        try:
            config = ConfigBuilder().load_from_file(self._path)
            print(f"Successfully fetched and built config from {self._path}")
            return config

        except Exception as e:
            print(f"[ERROR]: Cannot fetch config from {self._path}: {e} ")
            sys.exit(1)

    def _fetch_from_manager(self) -> EngineConfig | None:
        """Fetches the config from the api."""
        try:
            config = (
                ConfigBuilder()
                .with_config_from_api(agent_api_key=self._agent_api_key, url=self._url)
                .build()
            )
            print(f"Successfully fetched and built config from {self._url}")
            return config
        except Exception as e:
            print(f"[ERROR]: Cannot fetch config from {self._url}: {e} ")
            sys.exit(1)

    def serve(self) -> None:
        """Run the server using the idun engine."""
        try:
            app = create_app(engine_config=self._config)
            run_server(app, port=self._config.server.api.port, reload=False)  # pyright: ignore
        except Exception as e:
            raise ValueError(f"[ERROR]: Cannot start the agent server: {e}") from e


@click.command("serve")
@click.option("--source")
@click.option("--path")
def serve_command(source: str, path: str | None):
    """Exposes an agent as an API. Requires env vars: IDUN_AGENT_API_KEY and IDUN_MANAGER_HOST."""
    match source:
        case ServerSource.MANAGER:
            s = Serve(source=source)
        case ServerSource.FILE:
            s = Serve(source=source, path=path)
        case _:
            print(f"Argument {source} not recognized.")
    s.serve()
