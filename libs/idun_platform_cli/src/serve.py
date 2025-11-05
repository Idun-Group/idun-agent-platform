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

    def __init__(self) -> None:
        if not os.getenv("IDUN_AGENT_API_KEY") or not os.getenv("IDUN_MANAGER_HOST"):
            print(
                "[ERROR]: either IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST are not found. Make sure you add them both to your env variables."
            )
            sys.exit(1)

        self._url: str = os.environ["IDUN_MANAGER_HOST"]
        self._agent_api_key: str = os.environ["IDUN_AGENT_API_KEY"]
        self._config: EngineConfig | None = self._fetch_from_manager()

    def _fetch_from_manager(self) -> EngineConfig | None:
        """Fetches the config from the api.

        :param url: the manager host url.
        :param agent_api_key: the api key for your managed agent.
        """
        try:
            config = (
                ConfigBuilder()
                .with_config_from_api(agent_api_key=self._agent_api_key, url=self._url)
                .build()
            )
            print(f"Successfully fetched config from {self._url}")
            return config
        except Exception as e:
            print(f"[ERROR]: Cannot fetch config from {self._url}: {e} ")

    def serve(self) -> None:
        """Run the server using the idun engine."""
        try:
            app = create_app(engine_config=self._config)
            run_server(app, port=self._config.server.api.port, reload=False)  # pyright: ignore
        except Exception as e:
            raise ValueError(f"[ERROR]: Cannot start the agent server: {e}") from e


@click.command()
@click.option("--source")
def serve(source: str):
    """Command to serve the agent as a server."""
    match source:
        case ServerSource.MANAGER:
            s = Serve()
            s.serve()
        case ServerSource.FILE:
            print("From file")
        case _:
            print(f"Argument {source} not recognized.")
