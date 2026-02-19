from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_langgraph_agent_streaming():
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_langgraph_streaming",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    test_message = "test streaming message"
    session_id = "test_stream_session"

    events = []
    async for event in agent.stream({"query": test_message, "session_id": session_id}):
        events.append(event)

    assert agent is not None
    assert agent.name == "test_langgraph_streaming"
    assert agent.agent_type == "LangGraph"
    assert len(events) > 0
