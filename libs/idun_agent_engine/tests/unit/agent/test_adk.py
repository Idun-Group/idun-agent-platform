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
