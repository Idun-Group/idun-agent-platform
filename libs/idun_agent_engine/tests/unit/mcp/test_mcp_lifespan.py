"""Tests for active registry wiring in the server lifespan."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from idun_agent_engine.mcp.registry import get_active_registry, set_active_registry


@pytest.fixture(autouse=True)
def _clear_active_registry():
    set_active_registry(None)
    yield
    set_active_registry(None)


@pytest.mark.unit
class TestLifespanActiveRegistry:
    @pytest.mark.asyncio
    async def test_configure_app_sets_active_registry(self):
        """configure_app should call set_active_registry with the created MCPClientRegistry."""
        from idun_agent_engine.server.lifespan import configure_app

        mock_app = MagicMock()
        mock_app.state = MagicMock()

        mock_engine_config = MagicMock()
        mock_engine_config.mcp_servers = None
        mock_engine_config.guardrails = None
        mock_engine_config.sso = None
        mock_engine_config.integrations = None
        mock_engine_config.agent.type = "LANGGRAPH"
        mock_engine_config.agent.config = MagicMock()

        with patch(
            "idun_agent_engine.server.lifespan.ConfigBuilder.initialize_agent_from_config",
            new_callable=AsyncMock,
        ) as mock_init:
            mock_agent = MagicMock()
            mock_agent.discover_capabilities = MagicMock(return_value=MagicMock())
            mock_agent.copilotkit_agent_instance = MagicMock()
            mock_init.return_value = mock_agent

            await configure_app(mock_app, mock_engine_config)

            registry = get_active_registry()
            assert registry is not None

    @pytest.mark.asyncio
    async def test_cleanup_clears_active_registry(self):
        """After cleanup_agent, the active registry should be None."""
        from idun_agent_engine.mcp.registry import MCPClientRegistry
        from idun_agent_engine.server.lifespan import cleanup_agent

        # Set a registry first
        registry = MCPClientRegistry()
        set_active_registry(registry)
        assert get_active_registry() is not None

        mock_app = MagicMock()
        mock_app.state = MagicMock()
        mock_app.state.agent = None

        await cleanup_agent(mock_app)

        assert get_active_registry() is None
