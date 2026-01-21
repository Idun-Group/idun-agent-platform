from unittest.mock import AsyncMock, MagicMock, patch

from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.server.lifespan import lifespan


async def test_lifespan_with_yaml_config(tmp_path):
    config_data = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Lifecycle Agent",
                "graph_definition": "./agent.py:graph",
                "observability": {
                    "provider": "langfuse",
                    "enabled": True,
                    "options": {"run_name": "test-lifecycle"},
                },
            },
        },
    }

    engine_config = EngineConfig.model_validate(config_data)

    app = MagicMock()
    app.state.engine_config = engine_config

    mock_agent = AsyncMock()
    mock_agent.name = "Lifecycle Agent"

    with patch(
        "idun_agent_engine.core.config_builder.ConfigBuilder.initialize_agent_from_config"
    ) as mock_init:
        mock_init.return_value = mock_agent

        async with lifespan(app):
            assert app.state.agent == mock_agent
            assert app.state.config == engine_config
            mock_init.assert_called_once_with(engine_config)

        mock_agent.close.assert_called_once()
