"""Tests for the MCP helper resolution chain (get_langchain_tools, get_adk_tools).

Verifies the resolution order:
  1. Explicit config_path argument
  2. Active registry (engine running, config in memory)
  3. IDUN_CONFIG_PATH env var
  4. Manager API fallback
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from idun_agent_schema.engine.mcp_server import MCPServer

from idun_agent_engine.mcp.helpers import get_adk_tools, get_langchain_tools
from idun_agent_engine.mcp.registry import (
    MCPClientRegistry,
    set_active_registry,
)


@pytest.fixture(autouse=True)
def _clear_active_registry():
    """Ensure each test starts and ends with a clean active registry."""
    set_active_registry(None)
    yield
    set_active_registry(None)


def _make_enabled_registry(tools=None) -> MCPClientRegistry:
    """Create an enabled registry with mocked tools."""
    registry = MCPClientRegistry(
        configs=[
            MCPServer(
                name="test-server",
                transport="stdio",
                command="echo",
                args=["hello"],
            )
        ]
    )
    registry._client.get_tools = AsyncMock(return_value=tools or [])
    return registry


# ---------------------------------------------------------------------------
# get_langchain_tools resolution chain
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetLangchainToolsResolution:
    @pytest.mark.asyncio
    async def test_config_path_wins_over_active_registry(self, tmp_path):
        """Explicit config_path takes priority even when active registry is set."""
        config_file = tmp_path / "config.yaml"
        config_file.write_text(
            "mcp_servers:\n"
            "  - name: file-server\n"
            "    transport: stdio\n"
            "    command: echo\n"
            "    args: [hello]\n"
        )
        registry = _make_enabled_registry(tools=["from-registry"])
        set_active_registry(registry)

        with patch(
            "idun_agent_engine.mcp.helpers.get_langchain_tools_from_file",
            new_callable=AsyncMock,
            return_value=["from-file"],
        ) as mock_file:
            result = await get_langchain_tools(config_path=str(config_file))
            mock_file.assert_called_once_with(str(config_file))
            assert result == ["from-file"]

    @pytest.mark.asyncio
    async def test_uses_active_registry_when_enabled(self):
        """When no config_path and active registry is enabled, use it."""
        expected_tools = [MagicMock(name="tool1"), MagicMock(name="tool2")]
        registry = _make_enabled_registry(tools=expected_tools)
        set_active_registry(registry)

        result = await get_langchain_tools()
        assert result == expected_tools
        registry._client.get_tools.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_disabled_active_registry(self, monkeypatch):
        """When active registry has no servers (disabled), fall through."""
        registry = MCPClientRegistry()  # no configs → disabled
        set_active_registry(registry)

        monkeypatch.setenv("IDUN_CONFIG_PATH", "/fake/path.yaml")

        with patch(
            "idun_agent_engine.mcp.helpers.get_langchain_tools_from_file",
            new_callable=AsyncMock,
            return_value=["from-env"],
        ) as mock_file:
            result = await get_langchain_tools()
            mock_file.assert_called_once_with("/fake/path.yaml")
            assert result == ["from-env"]

    @pytest.mark.asyncio
    async def test_falls_back_to_env_var(self, monkeypatch):
        """No active registry, no config_path → uses IDUN_CONFIG_PATH."""
        monkeypatch.setenv("IDUN_CONFIG_PATH", "/env/config.yaml")

        with patch(
            "idun_agent_engine.mcp.helpers.get_langchain_tools_from_file",
            new_callable=AsyncMock,
            return_value=["from-env"],
        ) as mock_file:
            result = await get_langchain_tools()
            mock_file.assert_called_once_with("/env/config.yaml")
            assert result == ["from-env"]

    @pytest.mark.asyncio
    async def test_falls_back_to_api(self, monkeypatch):
        """No registry, no config_path, no env var → calls API."""
        monkeypatch.delenv("IDUN_CONFIG_PATH", raising=False)

        with patch(
            "idun_agent_engine.mcp.helpers.get_langchain_tools_from_api",
            new_callable=AsyncMock,
            return_value=["from-api"],
        ) as mock_api:
            result = await get_langchain_tools()
            mock_api.assert_called_once()
            assert result == ["from-api"]

    @pytest.mark.asyncio
    async def test_api_fallback_raises_without_credentials(self, monkeypatch):
        """API fallback raises ValueError when env vars missing."""
        monkeypatch.delenv("IDUN_CONFIG_PATH", raising=False)
        monkeypatch.delenv("IDUN_AGENT_API_KEY", raising=False)
        monkeypatch.delenv("IDUN_MANAGER_HOST", raising=False)

        with pytest.raises(ValueError, match="IDUN_AGENT_API_KEY"):
            await get_langchain_tools()

    @pytest.mark.asyncio
    async def test_no_new_registry_constructed_when_active(self):
        """Active registry is used directly — no MCPClientRegistry is constructed."""
        expected_tools = [MagicMock(name="tool1")]
        registry = _make_enabled_registry(tools=expected_tools)
        set_active_registry(registry)

        with patch(
            "idun_agent_engine.mcp.helpers._build_registry"
        ) as mock_build:
            result = await get_langchain_tools()
            mock_build.assert_not_called()
            assert result == expected_tools

    @pytest.mark.asyncio
    async def test_active_registry_returns_empty_list(self):
        """Active registry enabled but no tools discovered — returns empty list."""
        registry = _make_enabled_registry(tools=[])
        set_active_registry(registry)

        result = await get_langchain_tools()
        assert result == []


# ---------------------------------------------------------------------------
# get_adk_tools resolution chain
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestGetAdkToolsResolution:
    def test_config_path_wins_over_active_registry(self, tmp_path):
        """Explicit config_path takes priority even when active registry is set."""
        config_file = tmp_path / "config.yaml"
        config_file.write_text(
            "mcp_servers:\n"
            "  - name: file-server\n"
            "    transport: stdio\n"
            "    command: echo\n"
            "    args: [hello]\n"
        )
        registry = _make_enabled_registry()
        set_active_registry(registry)

        with patch(
            "idun_agent_engine.mcp.helpers.get_adk_tools_from_file",
            return_value=["from-file"],
        ) as mock_file:
            result = get_adk_tools(config_path=str(config_file))
            mock_file.assert_called_once_with(str(config_file))
            assert result == ["from-file"]

    def test_uses_active_registry_when_enabled(self):
        """When no config_path and active registry is enabled, use it."""
        registry = _make_enabled_registry()
        set_active_registry(registry)

        expected_toolsets = [MagicMock(name="toolset1")]
        with patch.object(
            registry, "get_adk_toolsets", return_value=expected_toolsets
        ):
            result = get_adk_tools()
            assert result == expected_toolsets

    def test_skips_disabled_active_registry(self, monkeypatch):
        """When active registry has no servers (disabled), fall through."""
        registry = MCPClientRegistry()  # disabled
        set_active_registry(registry)

        monkeypatch.setenv("IDUN_CONFIG_PATH", "/fake/path.yaml")

        with patch(
            "idun_agent_engine.mcp.helpers.get_adk_tools_from_file",
            return_value=["from-env"],
        ) as mock_file:
            result = get_adk_tools()
            mock_file.assert_called_once_with("/fake/path.yaml")
            assert result == ["from-env"]

    def test_falls_back_to_env_var(self, monkeypatch):
        """No active registry, no config_path → uses IDUN_CONFIG_PATH."""
        monkeypatch.setenv("IDUN_CONFIG_PATH", "/env/config.yaml")

        with patch(
            "idun_agent_engine.mcp.helpers.get_adk_tools_from_file",
            return_value=["from-env"],
        ) as mock_file:
            result = get_adk_tools()
            mock_file.assert_called_once_with("/env/config.yaml")
            assert result == ["from-env"]

    def test_falls_back_to_api(self, monkeypatch):
        """No registry, no config_path, no env var → calls API."""
        monkeypatch.delenv("IDUN_CONFIG_PATH", raising=False)

        with patch(
            "idun_agent_engine.mcp.helpers.get_adk_tools_from_api",
            return_value=["from-api"],
        ) as mock_api:
            result = get_adk_tools()
            mock_api.assert_called_once()
            assert result == ["from-api"]

    def test_api_fallback_raises_without_credentials(self, monkeypatch):
        """API fallback raises ValueError when env vars missing."""
        monkeypatch.delenv("IDUN_CONFIG_PATH", raising=False)
        monkeypatch.delenv("IDUN_AGENT_API_KEY", raising=False)
        monkeypatch.delenv("IDUN_MANAGER_HOST", raising=False)

        with pytest.raises(ValueError, match="IDUN_AGENT_API_KEY"):
            get_adk_tools()

    def test_no_new_registry_constructed_when_active(self):
        """Active registry is used directly — no MCPClientRegistry is constructed."""
        registry = _make_enabled_registry()
        set_active_registry(registry)

        expected_toolsets = [MagicMock(name="toolset1")]
        with patch.object(
            registry, "get_adk_toolsets", return_value=expected_toolsets
        ):
            with patch(
                "idun_agent_engine.mcp.helpers._build_registry"
            ) as mock_build:
                result = get_adk_tools()
                mock_build.assert_not_called()
                assert result == expected_toolsets

    def test_active_registry_returns_empty_list(self):
        """Active registry enabled but no toolsets — returns empty list."""
        registry = _make_enabled_registry()
        set_active_registry(registry)

        with patch.object(registry, "get_adk_toolsets", return_value=[]):
            result = get_adk_tools()
            assert result == []
