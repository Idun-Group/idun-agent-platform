"""Observability base classes and factory functions.

Defines the provider-agnostic interface and a factory to create handlers.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any

# Re-export config for backward compatibility
from .model import ObservabilityConfig


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
    config: ObservabilityConfig | dict[str, Any] | None,
) -> dict[str, Any]:
    if config is None:
        return {"enabled": False}
    if isinstance(config, ObservabilityConfig):
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
    config: ObservabilityConfig | dict[str, Any] | None,
) -> tuple[ObservabilityHandlerBase | None, dict[str, Any] | None]:
    """Factory to create an observability handler based on provider.

    Accepts either an `ObservabilityConfig` or a raw dict.
    Returns (handler, info_dict). info_dict can be attached to agent infos for debugging.
    """
    normalized = _normalize_config(config)
    provider = normalized.get("provider")
    enabled = normalized.get("enabled", False)
    options: dict[str, Any] = normalized.get("options", {})

    if not enabled or not provider:
        return None, {"enabled": False}

    if provider == "langfuse":
        from .langfuse.langfuse_handler import LangfuseHandler

        handler = LangfuseHandler(options)
        return handler, {
            "enabled": True,
            "provider": "langfuse",
            "host": os.getenv("LANGFUSE_HOST"),
            "run_name": handler.get_run_name(),
        }

    if provider == "phoenix":
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

    if provider == "phoenix-local":
        from .phoenix_local.phoenix_local_handler import PhoenixLocalHandler

        handler = PhoenixLocalHandler(options)
        return handler, {
            "enabled": True,
            "provider": "phoenix-local",
        }

    return None, {
        "enabled": False,
        "provider": provider,
        "error": "Unsupported provider",
    }
