"""Tests for observability factory and handler creation."""

import pytest

from idun_agent_engine.observability import create_observability_handler


@pytest.mark.unit
class TestObservabilityFactory:
    """Test observability handler factory behavior."""

    def test_create_observability_handler_disabled(self) -> None:
        """Factory returns disabled state when enabled is False."""
        handler, info = create_observability_handler({"enabled": False})
        assert handler is None
        assert info and info.get("enabled") is False

    def test_create_observability_handler_unknown_provider(self) -> None:
        """Factory returns None handler for unknown providers."""
        handler, info = create_observability_handler(
            {
                "provider": "unknown",
                "enabled": True,
                "options": {},
            }
        )
        assert handler is None
        assert info and info.get("provider") == "unknown"


@pytest.mark.unit
class TestObservabilityHandlers:
    """Test specific observability handler creation."""

    def test_langfuse_handler_creation(self, monkeypatch) -> None:
        """Ensure Langfuse handler is created when env vars are provided."""
        monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost:3000")
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")

        handler, info = create_observability_handler(
            {
                "provider": "langfuse",
                "enabled": True,
                "options": {},
            }
        )
        assert handler is not None
        assert info and info.get("provider") == "langfuse"

    def test_phoenix_handler_creation(self, monkeypatch) -> None:
        """Ensure Phoenix handler is created when env vars are provided."""
        monkeypatch.setenv("PHOENIX_COLLECTOR_ENDPOINT", "https://collector")
        monkeypatch.setenv("PHOENIX_API_KEY", "abc")

        handler, info = create_observability_handler(
            {
                "provider": "phoenix",
                "enabled": True,
                "options": {},
            }
        )
        assert handler is not None
        assert info and info.get("provider") == "phoenix"
