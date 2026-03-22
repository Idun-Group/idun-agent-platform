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
