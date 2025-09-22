"""Phoenix observability handler implementation."""

from __future__ import annotations

import os
import shlex
import socket
import subprocess
import time
from typing import Any
from urllib.parse import urlparse

from ..base import ObservabilityHandlerBase
from ..utils import _resolve_env


class PhoenixLocalHandler(ObservabilityHandlerBase):
    """Phoenix handler configuring OpenTelemetry and LangChain instrumentation."""

    provider = "phoenix-local"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler, start Phoenix via CLI, and set up instrumentation."""
        super().__init__(options)
        opts = self.options

        # Configure defaults and ensure Phoenix server is running locally
        self._callbacks: list[Any] = []
        self._proc: Any | None = None

        default_endpoint = "http://127.0.0.1:6006"
        collector = (
            self._resolve_env(opts.get("collector"))
            or self._resolve_env(opts.get("collector_endpoint"))
            or os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
            or default_endpoint
        )
        os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = collector

        parsed = urlparse(collector)
        host = parsed.hostname or "127.0.0.1"
        port = int(parsed.port or 6006)
        if host in ("127.0.0.1", "localhost") and not self._is_port_open(host, port):
            self._start_phoenix_cli()
            self._wait_for_port(host, port, timeout_seconds=10.0)

        # Configure tracer provider using phoenix.otel.register
        try:
            from openinference.instrumentation.langchain import LangChainInstrumentor
            from phoenix.otel import register  # type: ignore

            project_name = opts.get("project_name") or "default"
            tracer_provider = register(
                project_name=project_name, auto_instrument=True
            )
            LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
            self.project_name = project_name
        except Exception:
            # Silent failure; user may not have phoenix installed
            pass

    @staticmethod
    def _resolve_env(value: str | None) -> str | None:
        return _resolve_env(value)

    def get_callbacks(self) -> list[Any]:
        """Return callbacks (Phoenix instruments globally; this may be empty)."""
        return self._callbacks

    @staticmethod
    def _is_port_open(host: str, port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            try:
                return sock.connect_ex((host, port)) == 0
            except Exception:
                return False

    def _start_phoenix_cli(self) -> None:
        try:
            cmd = "phoenix serve"
            self._proc = subprocess.Popen(
                shlex.split(cmd),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception:
            self._proc = None

    @staticmethod
    def _wait_for_port(host: str, port: int, timeout_seconds: float) -> None:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if PhoenixLocalHandler._is_port_open(host, port):
                return
            time.sleep(0.2)
