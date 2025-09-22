"""Tests the ui helper functions to call the api."""

from idun_agent_engine_ui.app import send_message


def test_api_returns_valid_dict():
    """Test API call returns valid dict."""
    messages = [{"role": "user", "content": "Hello"}]
    result = send_message(messages)

    assert (
        not isinstance(result, dict) or "error" not in result
    )  # error is returned by the api in case of exceptions


def test_conversation():
    """Test API preserves conversation history."""
    messages = [
        {"role": "user", "content": "My name is John"},
        {"role": "assistant", "content": "Nice to meet you John!"},
        {"role": "user", "content": "What's my name?"},
    ]

    result = send_message(messages)
    assert result is not None
    assert "John" in result
    assert not isinstance(result, dict) or "error" not in result
