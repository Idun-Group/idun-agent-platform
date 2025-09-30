"""Phoenix observability handler implementation."""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
from typing import Any

from idun_agent_schema.shared.observability import _resolve_env

from ..base import ObservabilityHandlerBase

logger = logging.getLogger(__name__)


class PhoenixLocalHandler(ObservabilityHandlerBase):
    """Phoenix handler configuring OpenTelemetry and LangChain instrumentation."""

    provider = "phoenix-local"

    def __init__(
        self,
        options: dict[str, Any] | None = None,
        default_endpoint: str = "http://127.0.0.1:6006",
    ):
        """Initialize handler, start Phoenix via CLI, and set up instrumentation.

        Args:
            options: Configuration options dictionary
            default_endpoint: Default Phoenix collector endpoint URL
        """
        logger.info("Initializing PhoenixLocalHandler")

        super().__init__(options)
        opts = self.options or {}

        # Initialize instance variables
        self._callbacks: list[Any] = []
        self._proc: subprocess.Popen[bytes] | None = None
        self.default_endpoint = default_endpoint
        self.project_name: str = "default"

        self._configure_collector_endpoint(opts)
        self._start_phoenix_cli()

        try:
            from openinference.instrumentation.langchain import LangChainInstrumentor
            from phoenix.otel import register

            logger.debug("Successfully imported Phoenix dependencies")

            self.project_name = opts.get("project_name") or "default"
            logger.info(f"Using project name: {self.project_name}")

            tracer_provider = register(
                project_name=self.project_name, auto_instrument=True
            )

            LangChainInstrumentor().instrument(tracer_provider=tracer_provider)

        except ImportError as e:
            logger.error(f"Missing required Phoenix dependencies: {e}")
            raise ImportError(f"Phoenix dependencies not found: {e}. ") from e

        except Exception as e:
            logger.error(f"Failed to set up Phoenix instrumentation: {e}")
            raise RuntimeError(f"Phoenix instrumentation setup failed: {e}") from e

        logger.info("Phoenix local handler initialized...")

    def _configure_collector_endpoint(self, opts: dict[str, Any]) -> None:
        """Configure the Phoenix collector endpoint from various sources."""
        logger.debug("Configuring collector endpoint")

        collector = (
            self._resolve_env(opts.get("collector"))
            or self._resolve_env(opts.get("collector_endpoint"))
            or os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
            or self.default_endpoint
        )

        logger.info(f"Setting Phoenix collector endpoint to: {collector}")
        os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = collector
        self.collector_endpoint = collector

    def _start_phoenix_cli(self) -> None:
        """Start pheonix subprocess."""
        try:
            cmd = "phoenix serve"
            logger.debug(f"Executing command: {cmd}")

            self._proc = subprocess.Popen(
                shlex.split(cmd),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )

            logger.info(f"Phoenix server started with PID: {self._proc.pid}")

        except FileNotFoundError as e:
            logger.error(f"Phoenix CLI not found. Make sure Phoenix is installed : {e}")
            self._proc = None

        except subprocess.SubprocessError as e:
            logger.error(f"Failed to start Phoenix CLI subprocess: {e}")
            self._proc = None

        except Exception as e:
            logger.error(f"Unexpected error starting Phoenix CLI: {e}")
            self._proc = None

    @staticmethod
    def _resolve_env(value: str | None) -> str | None:
        """Resolve environment variable value."""
        return _resolve_env(value)

    def get_callbacks(self) -> list[Any]:
        """Return callbacks (Phoenix instruments globally; this may be empty)."""
        logger.debug("Getting callbacks (Phoenix uses global instrumentation)")
        return self._callbacks
