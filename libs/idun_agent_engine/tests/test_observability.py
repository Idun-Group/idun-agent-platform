"""Tests for generic observability factory behavior."""

from idun_agent_engine.observability import create_observability_handler


def test_create_observability_handler_disabled() -> None:
    """Factory returns disabled state when enabled is False."""
    handler, info = create_observability_handler({"enabled": False})
    assert handler is None
    assert info and info.get("enabled") is False


def test_create_observability_handler_unknown_provider() -> None:
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
