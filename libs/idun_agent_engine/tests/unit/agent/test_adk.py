import os

import pytest
from idun_agent_schema.engine.adk import (
    AdkAgentConfig,
    AdkInMemoryMemoryConfig,
    AdkInMemorySessionConfig,
)
from idun_agent_schema.engine.agent import AgentConfig
from idun_agent_schema.engine.agent_framework import AgentFramework

from idun_agent_engine.agent.adk.adk import AdkAgent


@pytest.fixture
def adk_agent_config():
    mock_agent_path = os.path.abspath("tests/fixtures/agents/mock_adk_agent.py")
    return AdkAgentConfig(
        name="Test ADK Agent",
        agent=f"{mock_agent_path}:mock_adk_agent_instance",
        app_name="test_app",
        session_service=AdkInMemorySessionConfig(),
        memory_service=AdkInMemoryMemoryConfig(),
    )


@pytest.mark.asyncio
async def test_adk_agent_initialize(adk_agent_config):
    agent = AdkAgent()
    await agent.initialize(adk_agent_config)

    assert agent.agent_instance is not None
    assert agent.copilotkit_agent_instance is not None
    assert agent.configuration == adk_agent_config
    assert agent.infos["status"] == "Initialized"
