from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from idun_agent_schema.engine.config import AgentConfig, EngineConfig
from idun_agent_schema.engine.server import ServerConfig


def test_engine_config_with_defaults():
    config = EngineConfig(
        agent=AgentConfig(
            type="langgraph",
            config=LangGraphAgentConfig(
                name="TestAgent", graph_definition="test.py:graph"
            ),
        )
    )

    assert config.server.api.port == 8000
    assert config.agent.type == "langgraph"


def test_agent_config_default_type():
    config = AgentConfig(config={"name": "Test", "graph_definition": "test.py:graph"})

    assert config.type == "langgraph"


def test_engine_config_from_dict():
    config_dict = {
        "server": {"api": {"port": 9000}},
        "agent": {"type": "langgraph", "config": {"name": "LangGraphAgent"}},
    }

    config = EngineConfig.model_validate(config_dict)

    assert config.server.api.port == 9000
    assert config.agent.type == "langgraph"


def test_engine_config_model_dump():
    config = EngineConfig(
        server=ServerConfig(),
        agent=AgentConfig(
            type="langgraph",
            config={"name": "Test", "graph_definition": "test.py:graph"},
        ),
    )

    dumped = config.model_dump()

    assert isinstance(dumped, dict)
    assert dumped["server"]["api"]["port"] == 8000
    assert dumped["agent"]["type"] == "langgraph"
