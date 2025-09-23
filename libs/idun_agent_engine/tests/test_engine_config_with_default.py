from idun_agent_engine.agent.langgraph.langgraph_model import LangGraphAgentConfig
from idun_agent_engine.core.engine_config import AgentConfig, EngineConfig
from idun_agent_engine.server.server_config import ServerConfig


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
        "agent": {"type": "haystack", "config": {"name": "HaystackAgent"}},
    }

    config = EngineConfig.model_validate(config_dict)

    assert config.server.api.port == 9000
    assert config.agent.type == "haystack"


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
