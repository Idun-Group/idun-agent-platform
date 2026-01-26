"""Test utilities and helper functions for idun_agent_engine tests.

This module provides utility functions and helper classes that complement
the fixtures in conftest.py. Use these for more complex test scenarios
that require additional setup or custom assertions.
"""

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock


# -----------------------------------------------------------------------------
# Configuration Builders
# -----------------------------------------------------------------------------


def build_config(
    *,
    port: int = 8000,
    agent_type: str = "LANGGRAPH",
    name: str = "Test Agent",
    graph_definition: str = "./test_agent.py:graph",
    observability: dict[str, Any] | None = None,
    checkpointer: dict[str, Any] | None = None,
    mcp_servers: list[dict[str, Any]] | None = None,
    guardrails: dict[str, Any] | None = None,
    **extra_agent_config: Any,
) -> dict[str, Any]:
    """Build a configuration dictionary with customizable options.

    This is a flexible builder function for creating test configurations
    without needing the fixture system.

    Args:
        port: The API port number.
        agent_type: The type of agent (e.g., "LANGGRAPH", "adk", "haystack").
        name: The agent name.
        graph_definition: Path to the graph definition.
        observability: Optional observability configuration.
        checkpointer: Optional checkpointer configuration.
        mcp_servers: Optional list of MCP server configurations.
        guardrails: Optional guardrails configuration.
        **extra_agent_config: Additional agent configuration options.

    Returns:
        A configuration dictionary ready for use with create_app or EngineConfig.

    Example:
        config = build_config(
            port=9000,
            name="My Test Agent",
            observability={"provider": "langfuse", "enabled": False}
        )
    """
    agent_config: dict[str, Any] = {
        "name": name,
        "graph_definition": graph_definition,
        **extra_agent_config,
    }

    if observability is not None:
        agent_config["observability"] = observability

    if checkpointer is not None:
        agent_config["checkpointer"] = checkpointer

    if mcp_servers is not None:
        agent_config["mcp_servers"] = mcp_servers

    if guardrails is not None:
        agent_config["guardrails"] = guardrails

    return {
        "server": {"api": {"port": port}},
        "agent": {
            "type": agent_type,
            "config": agent_config,
        },
    }


def build_minimal_config(tmp_path: Any | None = None) -> dict[str, Any]:
    """Build the absolute minimum valid configuration.

    Args:
        tmp_path: Optional temporary path for file references.

    Returns:
        A minimal valid configuration dictionary.
    """
    graph_path = f"{tmp_path}/agent.py:graph" if tmp_path else "./agent.py:graph"
    return build_config(port=0, graph_definition=graph_path)


# -----------------------------------------------------------------------------
# Mock Factories
# -----------------------------------------------------------------------------


def create_mock_event(
    event_type: str = "chunk",
    data: str = "test data",
    **extra_fields: Any,
) -> MagicMock:
    """Create a mock streaming event object.

    Args:
        event_type: The type of event (e.g., "chunk", "done", "error").
        data: The event data.
        **extra_fields: Additional fields to include in the event.

    Returns:
        A MagicMock configured to serialize as an event.
    """
    event = MagicMock()
    event.event = event_type
    event.data = data

    for key, value in extra_fields.items():
        setattr(event, key, value)

    def model_dump_json() -> str:
        event_dict = {"event": event_type, "data": data, **extra_fields}
        return json.dumps(event_dict)

    event.model_dump_json = model_dump_json
    return event


def create_mock_agent_with_responses(
    invoke_response: Any = "Mock response",
    stream_chunks: list[str] | None = None,
) -> AsyncMock:
    """Create a mock agent with preconfigured responses.

    Args:
        invoke_response: The response to return from invoke().
        stream_chunks: List of chunks to yield from stream().

    Returns:
        An AsyncMock agent configured with the specified responses.
    """
    if stream_chunks is None:
        stream_chunks = ["chunk-1", "chunk-2", "chunk-3"]

    agent = AsyncMock()
    agent.id = "mock-agent-id"
    agent.agent_type = "LANGGRAPH"
    agent.name = "Mock Agent"
    agent.infos = {"version": "1.0.0", "status": "ready"}

    # Configure invoke
    agent.invoke.return_value = invoke_response

    # Configure stream
    async def mock_stream(message: Any):
        for chunk in stream_chunks:
            yield create_mock_event(data=chunk)

    agent.stream = mock_stream
    agent.close = AsyncMock()

    return agent


def create_mock_observability_handler(
    enabled: bool = True,
    provider: str = "langfuse",
) -> tuple[MagicMock | None, dict[str, Any]]:
    """Create a mock observability handler and info dict.

    Args:
        enabled: Whether observability is enabled.
        provider: The observability provider name.

    Returns:
        A tuple of (handler, info_dict) mimicking create_observability_handler.
    """
    if not enabled:
        return None, {"enabled": False}

    handler = MagicMock()
    handler.provider = provider
    handler.enabled = enabled

    info = {
        "enabled": enabled,
        "provider": provider,
    }

    return handler, info


# -----------------------------------------------------------------------------
# Assertion Helpers
# -----------------------------------------------------------------------------


def assert_health_response(response: Any, expected_status: str = "healthy") -> None:
    """Assert that a health check response is valid.

    Args:
        response: The response object from the test client.
        expected_status: The expected health status.

    Raises:
        AssertionError: If the response doesn't match expected values.
    """
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert "status" in data, "Response missing 'status' field"
    assert (
        data["status"] == expected_status
    ), f"Expected '{expected_status}', got '{data['status']}'"


def assert_streaming_response(
    response: Any,
    min_chunks: int = 1,
) -> list[dict[str, Any]]:
    """Assert that a streaming response is valid and parse the events.

    Args:
        response: The response object from the test client.
        min_chunks: Minimum expected number of chunks.

    Returns:
        List of parsed event dictionaries.

    Raises:
        AssertionError: If the response is invalid or has too few chunks.
    """
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert "text/event-stream" in response.headers.get(
        "content-type", ""
    ), "Expected event-stream content type"

    # Parse SSE events
    events = []
    for line in response.text.split("\n"):
        if line.startswith("data: "):
            data_str = line[6:]  # Remove "data: " prefix
            if data_str.strip():
                try:
                    events.append(json.loads(data_str))
                except json.JSONDecodeError:
                    pass  # Skip non-JSON lines

    assert (
        len(events) >= min_chunks
    ), f"Expected at least {min_chunks} chunks, got {len(events)}"

    return events


def assert_agent_info_response(
    response: Any,
    expected_name: str | None = None,
) -> dict[str, Any]:
    """Assert that an agent info response is valid.

    Args:
        response: The response object from the test client.
        expected_name: Optional expected agent name.

    Returns:
        The parsed response data.

    Raises:
        AssertionError: If the response is invalid.
    """
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()

    if expected_name is not None:
        assert (
            data.get("name") == expected_name
        ), f"Expected name '{expected_name}', got '{data.get('name')}'"

    return data


# -----------------------------------------------------------------------------
# Test Data Generators
# -----------------------------------------------------------------------------


def generate_test_messages(count: int = 5) -> list[dict[str, Any]]:
    """Generate a list of test messages for agent testing.

    Args:
        count: Number of messages to generate.

    Returns:
        List of message dictionaries.
    """
    return [
        {
            "session_id": f"session-{i}",
            "query": f"Test query number {i}",
        }
        for i in range(count)
    ]


def generate_complex_query(
    session_id: str = "test-session",
    include_nested: bool = True,
) -> dict[str, Any]:
    """Generate a complex query message for testing.

    Args:
        session_id: The session identifier.
        include_nested: Whether to include nested data structures.

    Returns:
        A complex query dictionary.
    """
    query_data = {
        "session_id": session_id,
        "query": "Process this complex data",
    }

    if include_nested:
        query_data["metadata"] = {
            "source": "test",
            "nested": {
                "level": 1,
                "items": [1, 2, 3],
            },
        }

    return query_data
