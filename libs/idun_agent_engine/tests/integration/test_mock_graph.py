"""Integration tests for the mock graph fixtures.

These tests verify that the mock graph implementations work correctly
and can be used for integration testing.
"""

import pytest

from tests.fixtures.agents.mock_graph import (
    create_echo_graph,
    create_stateful_graph,
    graph,
)


@pytest.mark.integration
class TestEchoGraph:
    """Test the echo graph fixture."""

    def test_graph_is_compiled(self):
        """Default graph is a compiled runnable."""
        assert graph is not None
        # LangGraph compiled graphs have an invoke method
        assert hasattr(graph, "invoke")

    def test_echo_graph_echoes_message(self):
        """Echo graph returns the input message with prefix."""
        echo = create_echo_graph()

        result = echo.invoke(
            {
                "messages": [
                    {"role": "user", "content": "Hello, world!"}
                ]
            }
        )

        assert "messages" in result
        messages = result["messages"]
        assert len(messages) > 0

        # Find the assistant response (may be dict or LangChain message object)
        def get_content(msg):
            if isinstance(msg, dict):
                return msg.get("content", "")
            return getattr(msg, "content", "")

        def get_role(msg):
            if isinstance(msg, dict):
                return msg.get("role", "")
            # LangChain messages use type attribute or class name
            return getattr(msg, "type", getattr(msg, "role", msg.__class__.__name__.lower()))

        # Check that we have an echo response
        contents = [get_content(m) for m in messages]
        assert any("Echo:" in c for c in contents), f"Expected 'Echo:' in messages, got: {contents}"

    def test_echo_graph_handles_empty_messages(self):
        """Echo graph handles empty message list gracefully."""
        echo = create_echo_graph()

        result = echo.invoke({"messages": []})

        assert "messages" in result


@pytest.mark.integration
class TestStatefulGraph:
    """Test the stateful graph fixture."""

    def test_stateful_graph_increments_counter(self):
        """Stateful graph increments counter on each invocation."""
        stateful = create_stateful_graph()

        # First invocation
        result1 = stateful.invoke(
            {
                "messages": [{"role": "user", "content": "First"}],
                "counter": 0,
                "metadata": {},
            }
        )

        assert result1["counter"] == 1

    def test_stateful_graph_updates_metadata(self):
        """Stateful graph updates metadata tracking."""
        stateful = create_stateful_graph()

        result = stateful.invoke(
            {
                "messages": [
                    {"role": "user", "content": "Test message"}
                ],
                "counter": 0,
                "metadata": {},
            }
        )

        assert "metadata" in result
        assert "total_messages" in result["metadata"]
