from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_langgraph_agent_from_yaml():
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_langgraph_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    test_message = "test message"
    response = await agent.invoke({"query": test_message, "session_id": "test123"})

    assert agent is not None
    assert agent.name == "test_langgraph_agent"
    assert agent.agent_type == "LangGraph"
    assert response is not None
    assert test_message in str(response)


@pytest.mark.asyncio
async def test_langgraph_agent_accepts_compiled_graph():
    """A CompiledStateGraph is accepted: .builder is extracted and recompiled
    with the engine-managed checkpointer."""
    from langgraph.graph.state import CompiledStateGraph

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_compiled_graph_agent",
                "graph_definition": f"{mock_graph_path}:compiled_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert agent is not None
    assert agent.name == "test_compiled_graph_agent"
    # The engine recompiles from .builder, so the instance is a CompiledStateGraph
    assert isinstance(agent.agent_instance, CompiledStateGraph)
    # The engine's checkpointer must be injected (not None)
    assert agent.agent_instance.checkpointer is not None

    test_message = "hello compiled"
    response = await agent.invoke({"query": test_message, "session_id": "sess_compiled"})
    assert response is not None


@pytest.mark.asyncio
async def test_compiled_graph_replaces_user_checkpointer():
    """Engine's checkpointer replaces any checkpointer the user compiled with."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph.state import CompiledStateGraph

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_replace_checkpointer",
                "graph_definition": f"{mock_graph_path}:compiled_graph_with_checkpointer",
                "checkpointer": {"type": "memory"},
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert isinstance(agent.agent_instance, CompiledStateGraph)
    # Engine's checkpointer is injected, not the user's original
    assert agent.agent_instance.checkpointer is not None
    assert isinstance(agent.agent_instance.checkpointer, InMemorySaver)


@pytest.mark.asyncio
async def test_compiled_graph_preserves_interrupts(caplog):
    """When a compiled graph has interrupt_before/after, they are preserved."""
    import logging

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_interrupt_preserved",
                "graph_definition": f"{mock_graph_path}:compiled_graph_with_interrupts",
                "checkpointer": {"type": "memory"},
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()

    with caplog.at_level(logging.INFO):
        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert agent is not None
    # interrupt_before should be preserved after recompilation
    assert "echo" in agent.agent_instance.interrupt_before_nodes
    # Info log about preserving interrupts should be emitted
    assert any("interrupt_before" in msg for msg in caplog.messages)


@pytest.mark.asyncio
async def test_compiled_graph_warns_about_extraction(caplog):
    """A warning is logged when a CompiledStateGraph is detected and extracted."""
    import logging

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_warning_log",
                "graph_definition": f"{mock_graph_path}:compiled_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()

    with caplog.at_level(logging.WARNING):
        await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert any("CompiledStateGraph" in msg for msg in caplog.messages)
    assert any("extracting" in msg.lower() for msg in caplog.messages)


@pytest.mark.asyncio
async def test_compiled_graph_without_builder_raises():
    """If a CompiledStateGraph somehow lacks .builder, raise a clear error."""
    from unittest.mock import MagicMock

    from langgraph.graph.state import CompiledStateGraph

    from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

    agent = LanggraphAgent()
    fake = MagicMock(spec=CompiledStateGraph)
    del fake.builder

    with pytest.raises(TypeError, match="does not expose .builder"):
        agent._validate_graph_builder(fake, "test_module.py", "test_var")


@pytest.mark.asyncio
async def test_compiled_graph_name_preserved_in_compile():
    """The engine passes the obs_run_name or agent name to compile()."""
    from langgraph.graph.state import CompiledStateGraph

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_name_preserved",
                "graph_definition": f"{mock_graph_path}:compiled_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    assert isinstance(agent.agent_instance, CompiledStateGraph)
    assert agent.agent_instance.name == "test_name_preserved"


# ---------------------------------------------------------------------------
# WS3: sidecar fields excluded from input-mode detection
# ---------------------------------------------------------------------------


def _build_agent_with_state(state_cls):
    """Helper: compile an echo node over a state TypedDict, return a
    LanggraphAgent ready for ``discover_capabilities``."""
    from langgraph.graph import END, StateGraph

    from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

    async def node(state, config):  # pragma: no cover — never invoked
        return state

    builder = StateGraph(state_cls)
    builder.add_node("n", node)
    builder.set_entry_point("n")
    builder.add_edge("n", END)
    graph = builder.compile()

    agent = LanggraphAgent()
    agent._agent_instance = graph
    return agent


@pytest.mark.unit
class TestSidecarFieldsExcludedFromInputMode:
    """WS3: agents with `idun` (or future) sidecar fields must still
    report input.mode == "chat" so plain-text user messages aren't
    rejected as invalid JSON by the structured-input validator."""

    def test_state_with_only_messages_is_chat(self):
        # Sanity: existing chat-mode agent stays chat-mode.
        from typing import Annotated, TypedDict

        from langchain_core.messages import BaseMessage
        from langgraph.graph.message import add_messages

        class State(TypedDict):
            messages: Annotated[list[BaseMessage], add_messages]

        agent = _build_agent_with_state(State)
        caps = agent.discover_capabilities()
        assert caps.input.mode == "chat"

    def test_state_with_messages_and_idun_is_chat(self):
        # WS3 invariant: idun is a sidecar, not structured user input.
        from typing import Annotated, Any, TypedDict

        from langchain_core.messages import BaseMessage
        from langgraph.graph.message import add_messages

        class State(TypedDict):
            messages: Annotated[list[BaseMessage], add_messages]
            idun: dict[str, Any] | None

        agent = _build_agent_with_state(State)
        caps = agent.discover_capabilities()
        assert caps.input.mode == "chat", (
            "agents with `idun` sidecar must remain chat-mode"
        )

    def test_state_with_other_extra_field_is_structured(self):
        # Counter-invariant: agents with non-sidecar extra fields are
        # genuinely structured-mode.
        from typing import Annotated, TypedDict

        from langchain_core.messages import BaseMessage
        from langgraph.graph.message import add_messages

        class State(TypedDict):
            messages: Annotated[list[BaseMessage], add_messages]
            custom_field: str

        agent = _build_agent_with_state(State)
        caps = agent.discover_capabilities()
        assert caps.input.mode == "structured"
