"""Tests for FastAPI lifespan management."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.server.lifespan import lifespan


@pytest.mark.unit
class TestLifespan:
    """Test app lifespan startup and shutdown."""

    async def test_lifespan_initializes_and_closes_agent(self, tmp_path):
        """Lifespan initializes agent on startup and closes on shutdown."""
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
                # During lifespan, agent should be initialized
                assert app.state.agent == mock_agent
                assert app.state.config == engine_config
                mock_init.assert_called_once_with(engine_config)

            # After lifespan exits, agent should be closed
            mock_agent.close.assert_called_once()
