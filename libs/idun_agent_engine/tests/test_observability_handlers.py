"""Tests for Langfuse and Phoenix observability handlers."""

from idun_agent_engine.src.observability import create_observability_handler


def test_langfuse_handler_creation(monkeypatch) -> None:
    """Ensure Langfuse handler is created when env vars are provided."""
    monkeypatch.setenv("LANGFUSE_HOST", "http://localhost:3000")
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


def test_phoenix_handler_creation(monkeypatch) -> None:
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
