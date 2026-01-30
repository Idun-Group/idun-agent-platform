"""Tests for server dependency injection functions."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request

from idun_agent_engine.mcp import MCPClientRegistry
from idun_agent_engine.server.dependencies import (
    get_agent,
    get_copilotkit_agent,
    get_mcp_registry,
)


@pytest.mark.unit
class TestGetAgentDependency:
    """Test get_agent dependency function."""

    @pytest.mark.asyncio
    async def test_get_agent_from_app_state(self):
        """get_agent returns agent from app.state when available."""
        mock_agent = MagicMock()
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.agent = mock_agent

        result = await get_agent(mock_request)

        assert result == mock_agent

    @pytest.mark.asyncio
    async def test_get_agent_fallback_no_state(self, tmp_path):
        """get_agent falls back to loading from file when not in app.state."""
        import yaml

        config_dict = {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Fallback Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }
        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(config_dict))

        mock_request = MagicMock(spec=Request)
        del mock_request.app.state.agent

        with patch(
            "idun_agent_engine.server.dependencies.ConfigBuilder"
        ) as mock_builder:
            mock_config = MagicMock()
            mock_builder.load_from_file.return_value = mock_config

            mock_agent = MagicMock()
            mock_builder.initialize_agent_from_config = AsyncMock(
                return_value=mock_agent
            )

            result = await get_agent(mock_request)

            assert result == mock_agent
            mock_builder.load_from_file.assert_called_once()
            mock_builder.initialize_agent_from_config.assert_called_once_with(
                mock_config
            )


@pytest.mark.unit
class TestGetCopilotKitAgentDependency:
    """Test get_copilotkit_agent dependency function."""

    @pytest.mark.asyncio
    async def test_get_copilotkit_agent_from_app_state(self):
        """get_copilotkit_agent returns agent from app.state when available."""
        mock_agent = MagicMock()
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.copilotkit_agent = mock_agent

        result = await get_copilotkit_agent(mock_request)

        assert result == mock_agent

    @pytest.mark.asyncio
    async def test_get_copilotkit_agent_fallback_no_state(self):
        """get_copilotkit_agent falls back to loading from file when not in app.state."""
        mock_request = MagicMock(spec=Request)
        del mock_request.app.state.copilotkit_agent

        with patch(
            "idun_agent_engine.server.dependencies.ConfigBuilder"
        ) as mock_builder:
            mock_config = MagicMock()
            mock_builder.load_from_file.return_value = mock_config

            mock_agent = MagicMock()
            mock_builder.initialize_agent_from_config = AsyncMock(
                return_value=mock_agent
            )

            result = await get_copilotkit_agent(mock_request)

            assert result == mock_agent
            mock_builder.load_from_file.assert_called_once()


@pytest.mark.unit
class TestGetMCPRegistryDependency:
    """Test get_mcp_registry dependency function."""

    def test_get_mcp_registry_success(self):
        """get_mcp_registry returns registry when available and enabled."""
        mock_registry = MagicMock(spec=MCPClientRegistry)
        mock_registry.enabled = True

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.mcp_registry = mock_registry

        result = get_mcp_registry(mock_request)

        assert result == mock_registry

    def test_get_mcp_registry_not_configured(self):
        """get_mcp_registry raises 404 when registry not in app.state."""
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.mcp_registry = None

        with pytest.raises(HTTPException) as exc_info:
            get_mcp_registry(mock_request)

        assert exc_info.value.status_code == 404
        assert "not configured" in exc_info.value.detail

    def test_get_mcp_registry_disabled(self):
        """get_mcp_registry raises 404 when registry is disabled."""
        mock_registry = MagicMock(spec=MCPClientRegistry)
        mock_registry.enabled = False

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.mcp_registry = mock_registry

        with pytest.raises(HTTPException) as exc_info:
            get_mcp_registry(mock_request)

        assert exc_info.value.status_code == 404
        assert "not configured" in exc_info.value.detail
