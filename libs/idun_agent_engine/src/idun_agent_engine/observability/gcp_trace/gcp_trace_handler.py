"""GCP Trace observability handler."""

from __future__ import annotations

from typing import Any

from ..base import ObservabilityHandlerBase


class GCPTraceHandler(ObservabilityHandlerBase):
    """GCP Trace handler."""

    provider = "gcp_trace"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler."""
        super().__init__(options)
        raise NotImplementedError("GCP Trace observability is not implemented yet.")

    def get_callbacks(self) -> list[Any]:
        """Return callbacks."""
        return []
