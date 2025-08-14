"""Provider-agnostic observability configuration model."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .utils import _resolve_env


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
    # Keep options generic to support different providers while remaining strongly-typed at the top level
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
