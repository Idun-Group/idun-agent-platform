"""GCP Logging observability handler."""

from __future__ import annotations

from typing import Any

from ..base import ObservabilityHandlerBase


class GCPLoggingHandler(ObservabilityHandlerBase):
    """GCP Logging handler."""

    provider = "gcp_logging"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler."""
        super().__init__(options)
        raise NotImplementedError("GCP Logging observability is not implemented yet.")

    def get_callbacks(self) -> list[Any]:
        """Return callbacks."""
        return []
