"""GCP Logging observability handler."""

from __future__ import annotations

import logging
from typing import Any

from ..base import ObservabilityHandlerBase

logger = logging.getLogger(__name__)


class GCPLoggingHandler(ObservabilityHandlerBase):
    """GCP Logging handler."""

    provider = "gcp_logging"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler."""
        super().__init__(options)
        self.options = options or {}

        try:
            import google.cloud.logging
        except ImportError as e:
            logger.error("GCP Logging dependencies not found: %s", e)
            raise ImportError(
                "Please install 'google-cloud-logging' to use GCP Logging."
            ) from e

        project_id = self.options.get("project_id")
        # If project_id is explicitly provided, use it, otherwise client will auto-detect
        if project_id:
            client = google.cloud.logging.Client(project=project_id)
        else:
            client = google.cloud.logging.Client()

        # Get logging configuration options
        log_level = self.options.get("severity", "INFO").upper()
        level = getattr(logging, log_level, logging.INFO)

        # Setup logging handler
        # This attaches a CloudLoggingHandler to the root python logger
        client.setup_logging(log_level=level)

        logger.info("GCP Logging initialized for project: %s", client.project)

    def get_callbacks(self) -> list[Any]:
        """Return callbacks."""
        # GCP Logging hooks into the standard python logging module,
        # so no explicit LangChain callbacks are needed.
        return []
