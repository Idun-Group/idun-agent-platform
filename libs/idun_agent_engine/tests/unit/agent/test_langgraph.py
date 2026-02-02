import pytest
from pathlib import Path


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
