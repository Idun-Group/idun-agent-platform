"""Observability base classes and factory functions.

Defines the provider-agnostic interface and a factory to create handlers.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any

from idun_agent_schema.engine.observability import ObservabilityConfig as ObservabilityConfigV1
from idun_agent_schema.engine.observability_v2 import (
    ObservabilityConfig as ObservabilityConfigV2,
    ObservabilityProvider,
)


class ObservabilityHandlerBase(ABC):
    """Abstract base class for observability handlers.

    Concrete implementations must provide provider name and callbacks.
    """

    provider: str

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        """Initialize handler with provider-specific options."""
        self.options: dict[str, Any] = options or {}

    @abstractmethod
    def get_callbacks(self) -> list[Any]:
        """Return a list of callbacks (can be empty)."""
        raise NotImplementedError

    def get_run_name(self) -> str | None:
        """Optional run name used by frameworks that support it."""
        run_name = self.options.get("run_name")
        return run_name if isinstance(run_name, str) else None


def _normalize_config(
    config: ObservabilityConfigV1 | ObservabilityConfigV2 | dict[str, Any] | None,
) -> dict[str, Any]:
    if config is None:
        return {"enabled": False}

    if isinstance(config, ObservabilityConfigV2):
        if not config.enabled:
            return {"enabled": False}

        provider = config.provider.value if hasattr(config.provider, "value") else config.provider
        options = config.config.model_dump()
        return {
            "provider": provider,
            "enabled": config.enabled,
            "options": options,
        }

    if isinstance(config, ObservabilityConfigV1):
        resolved = config.resolved()
        return {
            "provider": resolved.provider,
            "enabled": resolved.enabled,
            "options": resolved.options,
        }
    # Assume dict-like
    provider = (config or {}).get("provider")
    enabled = bool((config or {}).get("enabled", False))
    options = dict((config or {}).get("options", {}))
    return {"provider": provider, "enabled": enabled, "options": options}


def create_observability_handler(
    config: ObservabilityConfigV1 | ObservabilityConfigV2 | dict[str, Any] | None,
) -> tuple[ObservabilityHandlerBase | None, dict[str, Any] | None]:
    """Factory to create an observability handler based on provider.

    Accepts either an `ObservabilityConfig` (V1 or V2) or a raw dict.
    Returns (handler, info_dict). info_dict can be attached to agent infos for debugging.
    """
    normalized = _normalize_config(config)
    provider = normalized.get("provider")
    enabled = normalized.get("enabled", False)
    options: dict[str, Any] = normalized.get("options", {})

    if not enabled or not provider:
        return None, {"enabled": False}

    # Ensure provider is string comparison
    if hasattr(provider, "value"):
        provider = provider.value

    # Case-insensitive check for provider
    provider_upper = str(provider).upper()

    if provider_upper == ObservabilityProvider.LANGFUSE:
        from .langfuse.langfuse_handler import LangfuseHandler

        handler = LangfuseHandler(options)
        return handler, {
            "enabled": True,
            "provider": "langfuse",
            "host": os.getenv("LANGFUSE_BASE_URL"),
            "run_name": handler.get_run_name(),
        }

    if provider_upper == ObservabilityProvider.PHOENIX:
        from .phoenix.phoenix_handler import PhoenixHandler

        handler = PhoenixHandler(options)
        info: dict[str, Any] = {
            "enabled": True,
            "provider": "phoenix",
            "collector": os.getenv("PHOENIX_COLLECTOR_ENDPOINT"),
        }
        project_name = getattr(handler, "project_name", None)
        if project_name:
            info["project_name"] = project_name
        return handler, info

    # if provider == "phoenix-local":
    #     from .phoenix_local.phoenix_local_handler import PhoenixLocalHandler
    #
    #     handler = PhoenixLocalHandler(options)
    #     return handler, {
    #         "enabled": True,
    #         "provider": "phoenix-local",
    #     }

    if provider_upper == ObservabilityProvider.GCP_LOGGING:
        from .gcp_logging.gcp_logging_handler import GCPLoggingHandler

        handler = GCPLoggingHandler(options)
        return handler, {
            "enabled": True,
            "provider": "gcp_logging",
        }

    if provider_upper == ObservabilityProvider.GCP_TRACE:
        from .gcp_trace.gcp_trace_handler import GCPTraceHandler

        handler = GCPTraceHandler(options)
        return handler, {
            "enabled": True,
            "provider": "gcp_trace",
        }

    return None, {
        "enabled": False,
        "provider": provider,
        "error": "Unsupported provider",
    }

def create_observability_handlers(
    configs: list[ObservabilityConfigV2 | ObservabilityConfigV1] | None,
) -> tuple[list[ObservabilityHandlerBase], list[dict[str, Any]]]:
    """Create multiple observability handlers from a list of configs."""
    handlers = []
    infos = []

    if not configs:
        return [], []

    for config in configs:
        handler, info = create_observability_handler(config)
        if handler:
            handlers.append(handler)
        if info:
            infos.append(info)

    return handlers, infos
