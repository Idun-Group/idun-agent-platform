import pytest
from pathlib import Path


@pytest.mark.asyncio
async def test_haystack_agent_from_yaml():
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_pipeline_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_haystack_pipeline.py"
    )

    config = {
        "agent": {
            "type": "HAYSTACK",
            "config": {
                "name": "test_haystack_agent",
                "component_type": "pipeline",
                "component_definition": f"{mock_pipeline_path}:mock_haystack_pipeline",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    test_message = "test query"
    response = await agent.invoke({"query": test_message, "session_id": "test123"})

    assert agent is not None
    assert agent.name == "test_haystack_agent"
    assert agent.agent_type == "haystack"
    assert response is not None
    assert f"Response to: {test_message}" in str(response)
