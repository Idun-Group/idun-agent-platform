"""Provider-agnostic observability configuration model (shared)."""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field


def _resolve_env(value: Any) -> Any:
    """Resolve environment placeholders in strings.

    Supports patterns ${VAR} and $VAR. Non-strings are returned unchanged.
    """
    if isinstance(value, str):
        if value.startswith("${") and value.endswith("}"):
            return os.getenv(value[2:-1])
        if value.startswith("$"):
            return os.getenv(value[1:])
    return value


class ObservabilityConfig(BaseModel):
    """Provider-agnostic observability configuration based on Pydantic.

    Example YAML:
      observability:
        provider: "langfuse"  # or "phoenix"
        enabled: true
        options:
          host: ${LANGFUSE_HOST}
          public_key: ${LANGFUSE_PUBLIC_KEY}
          secret_key: ${LANGFUSE_SECRET_KEY}
          run_name: "my-run"
    """

    provider: str | None = Field(default=None)
    enabled: bool = Field(default=False)
    options: dict[str, Any] = Field(default_factory=dict)

    def _resolve_value(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {k: self._resolve_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._resolve_value(v) for v in value]
        return _resolve_env(value)

    def resolved(self) -> ObservabilityConfig:
        """Return a copy with env placeholders resolved in options."""
        resolved_options = self._resolve_value(self.options)
        return ObservabilityConfig(
            provider=self.provider,
            enabled=self.enabled,
            options=resolved_options,
        )
