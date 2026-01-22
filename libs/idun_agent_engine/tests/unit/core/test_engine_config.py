"""Tests for EngineConfig schema validation and defaults."""

import pytest
from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from idun_agent_engine.core.engine_config import AgentConfig, EngineConfig
from idun_agent_engine.server.server_config import ServerConfig


@pytest.mark.unit
class TestEngineConfigDefaults:
    """Test default values for EngineConfig."""

    def test_engine_config_with_defaults(self):
        """Server defaults are applied when not specified."""
        config = EngineConfig(
            agent=AgentConfig(
                type="LANGGRAPH",
                config=LangGraphAgentConfig(
                    name="TestAgent", graph_definition="test.py:graph"
                ),
            )
        )

        assert config.server.api.port == 8000
        assert config.agent.type == "LANGGRAPH"

    def test_agent_config_requires_type(self):
        """AgentConfig requires explicit type."""
        config = AgentConfig(
            type="LANGGRAPH",
            config={"name": "Test", "graph_definition": "test.py:graph"},
        )

        assert config.type == "LANGGRAPH"


@pytest.mark.unit
class TestEngineConfigValidation:
    """Test EngineConfig validation from various sources."""

    def test_engine_config_from_dict(self):
        """EngineConfig can be created from a dictionary."""
        config_dict = {
            "server": {"api": {"port": 9000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "LangGraphAgent", "graph_definition": "test.py:graph"},
            },
        }

        config = EngineConfig.model_validate(config_dict)

        assert config.server.api.port == 9000
        assert config.agent.type == "LANGGRAPH"

    def test_engine_config_model_dump(self):
        """EngineConfig can be serialized to dict."""
        config = EngineConfig(
            server=ServerConfig(),
            agent=AgentConfig(
                type="LANGGRAPH",
                config={"name": "Test", "graph_definition": "test.py:graph"},
            ),
        )

        dumped = config.model_dump()

        assert isinstance(dumped, dict)
        assert dumped["server"]["api"]["port"] == 8000
        assert dumped["agent"]["type"] == "LANGGRAPH"
