"""Mock LangGraph implementations for testing.

These are minimal but functional LangGraph graphs that can be used
in integration tests to verify the full agent lifecycle without
needing real LLM calls.
"""

from typing import Annotated, Any, TypedDict

from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


# -----------------------------------------------------------------------------
# State Definitions
# -----------------------------------------------------------------------------


class SimpleState(TypedDict):
    """Simple state for basic testing."""

    messages: Annotated[list[dict[str, Any]], add_messages]


class StatefulState(TypedDict):
    """State with additional fields for stateful testing."""

    messages: Annotated[list[dict[str, Any]], add_messages]
    counter: int
    metadata: dict[str, Any]


# -----------------------------------------------------------------------------
# Node Functions
# -----------------------------------------------------------------------------


def echo_node(state: SimpleState) -> dict[str, Any]:
    """Echo the last message back with a prefix.

    This is the simplest possible node - it just echoes input.
    """
    messages = state.get("messages", [])
    if not messages:
        return {"messages": [{"role": "assistant", "content": "No message received"}]}

    last_message = messages[-1]
    content = last_message.get("content", "") if isinstance(last_message, dict) else str(last_message)

    return {
        "messages": [
            {
                "role": "assistant",
                "content": f"Echo: {content}",
            }
        ]
    }


def counter_node(state: StatefulState) -> dict[str, Any]:
    """Increment counter and respond with count.

    Useful for testing stateful behavior and checkpointing.
    """
    current_count = state.get("counter", 0)
    new_count = current_count + 1

    return {
        "messages": [
            {
                "role": "assistant",
                "content": f"Count is now: {new_count}",
            }
        ],
        "counter": new_count,
    }


def metadata_node(state: StatefulState) -> dict[str, Any]:
    """Update metadata based on message content.

    Useful for testing complex state updates.
    """
    messages = state.get("messages", [])
    metadata = state.get("metadata", {}).copy()

    # Track message count
    metadata["total_messages"] = len(messages)

    # Track last interaction
    if messages:
        last_msg = messages[-1]
        metadata["last_role"] = last_msg.get("role", "unknown") if isinstance(last_msg, dict) else "unknown"

    return {"metadata": metadata}


# -----------------------------------------------------------------------------
# Graph Builders
# -----------------------------------------------------------------------------


def create_echo_graph() -> StateGraph:
    """Create a simple echo graph for basic testing.

    This graph just echoes back whatever message it receives.

    Returns:
        A compiled LangGraph that echoes messages.
    """
    builder = StateGraph(SimpleState)

    builder.add_node("echo", echo_node)
    builder.set_entry_point("echo")
    builder.add_edge("echo", END)

    return builder.compile()


def create_stateful_graph() -> StateGraph:
    """Create a stateful graph for testing persistence.

    This graph maintains state across invocations, useful for
    testing checkpointer functionality.

    Returns:
        A compiled LangGraph with stateful behavior.
    """
    builder = StateGraph(StatefulState)

    builder.add_node("counter", counter_node)
    builder.add_node("metadata", metadata_node)

    builder.set_entry_point("counter")
    builder.add_edge("counter", "metadata")
    builder.add_edge("metadata", END)

    return builder.compile()


# -----------------------------------------------------------------------------
# Default Graph Instance
# -----------------------------------------------------------------------------

# This is the default graph that will be loaded by graph_definition
# "tests.fixtures.agents.mock_graph:graph"
graph = create_echo_graph()
