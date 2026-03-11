"""LangSmith observability handler implementation."""

from __future__ import annotations

import logging
import os
from typing import Any

from ..base import ObservabilityHandlerBase

logger = logging.getLogger(__name__)


class LangsmithHandler(ObservabilityHandlerBase):
    """LangSmith handler that configures tracing via environment variables.

    LangSmith tracing is automatic for LangChain/LangGraph when the
    appropriate env vars are set. No explicit callbacks are needed.
    """

    provider = "langsmith"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler, setting env vars for LangSmith SDK."""
        super().__init__(options)
        opts = self.options

        os.environ["LANGSMITH_TRACING"] = "true"

        endpoint = opts.get("endpoint")
        if endpoint:
            os.environ["LANGSMITH_ENDPOINT"] = endpoint

        api_key = opts.get("api_key")
        if api_key:
            os.environ["LANGSMITH_API_KEY"] = api_key

        project_name = opts.get("project_name")
        if project_name:
            os.environ["LANGSMITH_PROJECT"] = project_name

        try:
            import langsmith

            langsmith.Client()
            logger.info("LangSmith client initialized")
        except ImportError:
            logger.error("langsmith package not installed")
        except Exception as e:
            logger.warning(f"LangSmith client init warning: {e}")

    def get_callbacks(self) -> list[Any]:
        """Return empty list — LangSmith tracing is env-var based."""
        return []
