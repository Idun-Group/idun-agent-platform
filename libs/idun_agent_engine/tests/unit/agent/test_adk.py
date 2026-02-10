from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_adk_agent_from_yaml():
    from ag_ui.core import RunAgentInput, UserMessage

    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_agent_path = (
        Path(__file__).parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )

    config = {
        "agent": {
            "type": "ADK",
            "config": {
                "name": "test_adk_agent",
                "app_name": "test_adk_agent",
                "agent": f"{mock_agent_path}:mock_adk_agent_instance",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    copilotkit_agent = agent.copilotkit_agent_instance

    test_message = "Hello ADK"
    input_data = RunAgentInput(
        threadId="test-thread-001",
        runId="test-run-001",
        state={},
        messages=[UserMessage(id="msg-001", role="user", content=test_message)],
        tools=[],
        context=[],
        forwardedProps={},
    )

    events = []
    async for event in copilotkit_agent.run(input_data):
        if event is not None:
            events.append(event)

    assert agent is not None
    assert agent.name == "test_adk_agent"
    assert agent.agent_type == "ADK"
    assert len(events) > 0

    response_content = None
    for event in events:
        if hasattr(event, "delta") and event.delta:
            response_content = event.delta
            break

    assert response_content is not None
    assert test_message in response_content

    await copilotkit_agent._session_manager.stop_cleanup_task()
