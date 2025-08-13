from __future__ import annotations

from typing import Any, List, Optional, Dict
import os
from ..utils import _resolve_env
from ..base import ObservabilityHandlerBase


class PhoenixHandler(ObservabilityHandlerBase):
    provider = "phoenix"

    def __init__(self, options: Optional[Dict[str, Any]] = None):
        super().__init__(options)
        opts = self.options

        # Resolve and set env vars as required by Phoenix
        api_key = self._resolve_env(opts.get("api_key")) or os.getenv("PHOENIX_API_KEY")
        collector = self._resolve_env(opts.get("collector")) or \
                    self._resolve_env(opts.get("collector_endpoint")) or os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
        self.project_name: str = opts.get("project_name") or "default"

        if api_key:
            os.environ["PHOENIX_API_KEY"] = api_key
        if collector:
            os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = collector

        # Some older Phoenix deployments (before 2025-06-24) require setting client headers.
        # If not explicitly provided, set it from API key when available for backward compatibility.
        client_headers = opts.get("client_headers")
        if isinstance(client_headers, str) and client_headers:
            os.environ["PHOENIX_CLIENT_HEADERS"] = client_headers
        elif api_key and not os.getenv("PHOENIX_CLIENT_HEADERS"):
            os.environ["PHOENIX_CLIENT_HEADERS"] = f"api_key={api_key}"

        # Configure tracer provider using phoenix.otel.register
        self._callbacks: List[Any] = []
        try:
            from phoenix.otel import register  # type: ignore
            from openinference.instrumentation.langchain import LangChainInstrumentor
            tracer_provider = register(project_name=self.project_name, auto_instrument=True)
            LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
        except Exception:
            # Silent failure; user may not have phoenix installed
            pass

    @staticmethod
    def _resolve_env(value: Optional[str]) -> Optional[str]:
        return _resolve_env(value)
    
    def get_callbacks(self) -> List[Any]:
        # Phoenix instruments globally; return empty list
        return self._callbacks


