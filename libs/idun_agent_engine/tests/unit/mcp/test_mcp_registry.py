import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from idun_agent_schema.engine.mcp_server import MCPServer
from idun_agent_engine.mcp.registry import MCPClientRegistry


@pytest.mark.unit
class TestMCPRegistryInitialization:
    def test_registry_disabled_when_no_configs(self):
        registry = MCPClientRegistry()
        assert not registry.enabled
        assert registry._client is None

    def test_registry_enabled_with_configs(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["arg1"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        assert registry.enabled
        assert registry._client is not None

    def test_registry_stores_configs(self):
        configs = [
            MCPServer(
                name="server1",
                transport="stdio",
                command="cmd1",
                args=["--test"],
            ),
            MCPServer(
                name="server2",
                transport="stdio",
                command="cmd2",
                args=["--test"],
            ),
        ]
        registry = MCPClientRegistry(configs=configs)
        assert len(registry._configs) == 2


@pytest.mark.unit
class TestMCPRegistryProperties:
    def test_available_servers_returns_empty_when_disabled(self):
        registry = MCPClientRegistry()
        assert registry.available_servers() == []

    def test_available_servers_returns_server_names(self):
        configs = [
            MCPServer(
                name="server1", transport="stdio", command="cmd1", args=["--test"]
            ),
            MCPServer(
                name="server2", transport="stdio", command="cmd2", args=["--test"]
            ),
        ]
        registry = MCPClientRegistry(configs=configs)
        servers = registry.available_servers()
        assert "server1" in servers
        assert "server2" in servers

    def test_client_property_raises_when_disabled(self):
        registry = MCPClientRegistry()
        with pytest.raises(RuntimeError, match="No MCP servers configured"):
            _ = registry.client

    def test_client_property_returns_client_when_enabled(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        client = registry.client
        assert client is not None


@pytest.mark.unit
class TestMCPRegistryGetClient:
    def test_get_client_without_name_returns_client(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        client = registry.get_client()
        assert client is not None

    def test_get_client_with_valid_name_returns_client(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        client = registry.get_client(name="test-server")
        assert client is not None

    def test_get_client_with_invalid_name_raises_error(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        with pytest.raises(ValueError, match="MCP server 'invalid' is not configured"):
            registry.get_client(name="invalid")

    def test_get_client_disabled_raises_when_validating_name(self):
        registry = MCPClientRegistry()
        with pytest.raises(RuntimeError, match="MCP client registry is not enabled"):
            registry.get_client(name="any-server")


@pytest.mark.unit
class TestMCPRegistryGetSession:
    def test_get_session_validates_server_exists(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        with pytest.raises(
            ValueError, match="MCP server 'nonexistent' is not configured"
        ):
            registry.get_session(name="nonexistent")

    def test_get_session_returns_context_manager(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)
        mock_session = MagicMock()
        registry._client.session = MagicMock(return_value=mock_session)

        session = registry.get_session(name="test-server")
        assert session is not None
        registry._client.session.assert_called_once_with("test-server")


@pytest.mark.unit
class TestMCPRegistryGetTools:
    @pytest.mark.asyncio
    async def test_get_tools_raises_when_disabled(self):
        registry = MCPClientRegistry()
        with pytest.raises(RuntimeError, match="MCP client registry is not enabled"):
            await registry.get_tools()

    @pytest.mark.asyncio
    async def test_get_tools_calls_client_get_tools(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        mock_tools = [{"name": "tool1"}, {"name": "tool2"}]
        registry._client.get_tools = AsyncMock(return_value=mock_tools)

        tools = await registry.get_tools()
        assert tools == mock_tools
        registry._client.get_tools.assert_called_once_with(server_name=None)

    @pytest.mark.asyncio
    async def test_get_tools_with_server_name(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        mock_tools = [{"name": "tool1"}]
        registry._client.get_tools = AsyncMock(return_value=mock_tools)

        tools = await registry.get_tools(name="test-server")
        assert tools == mock_tools
        registry._client.get_tools.assert_called_once_with(server_name="test-server")

    @pytest.mark.asyncio
    async def test_get_langchain_tools_calls_get_tools(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        mock_tools = [{"name": "tool1"}]
        registry._client.get_tools = AsyncMock(return_value=mock_tools)

        tools = await registry.get_langchain_tools(name="test-server")
        assert tools == mock_tools
        registry._client.get_tools.assert_called_once_with(server_name="test-server")


@pytest.mark.unit
class TestMCPRegistryGetADKToolsets:
    def test_get_adk_toolsets_raises_when_imports_missing(self):
        registry = MCPClientRegistry()
        with patch("idun_agent_engine.mcp.registry.McpToolset", None):
            with pytest.raises(
                ImportError, match="google-adk and mcp packages are required"
            ):
                registry.get_adk_toolsets()

    def test_get_adk_toolsets_returns_empty_for_no_configs(self):
        registry = MCPClientRegistry()
        with patch("idun_agent_engine.mcp.registry.McpToolset") as mock_toolset:
            with patch("idun_agent_engine.mcp.registry.StdioServerParameters"):
                toolsets = registry.get_adk_toolsets()
                assert toolsets == []

    def test_get_adk_toolsets_creates_toolset_for_stdio_config(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["arg1", "arg2"],
                env={"KEY": "value"},
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        mock_toolset_class = MagicMock()
        mock_params_class = MagicMock()

        with patch("idun_agent_engine.mcp.registry.McpToolset", mock_toolset_class):
            with patch(
                "idun_agent_engine.mcp.registry.StdioServerParameters",
                mock_params_class,
            ):
                toolsets = registry.get_adk_toolsets()

                mock_params_class.assert_called_once()
                call_kwargs = mock_params_class.call_args[1]
                assert call_kwargs["command"] == "test-cmd"
                assert call_kwargs["args"] == ["arg1", "arg2"]
                assert call_kwargs["env"] == {"KEY": "value"}

                mock_toolset_class.assert_called_once()
                assert len(toolsets) == 1

    def test_get_adk_toolsets_uses_encoding_defaults(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        mock_params_class = MagicMock()

        with patch("idun_agent_engine.mcp.registry.McpToolset", MagicMock()):
            with patch(
                "idun_agent_engine.mcp.registry.StdioServerParameters",
                mock_params_class,
            ):
                registry.get_adk_toolsets()

                call_kwargs = mock_params_class.call_args[1]
                assert call_kwargs["encoding"] == "utf-8"
                assert call_kwargs["encoding_error_handler"] == "strict"

    def test_get_adk_toolsets_returns_toolsets_with_connection_params(self):
        configs = [
            MCPServer(
                name="test-server",
                transport="stdio",
                command="test-cmd",
                args=["--test"],
            )
        ]
        registry = MCPClientRegistry(configs=configs)

        adk_toolsets = registry.get_adk_toolsets()

        assert len(adk_toolsets) > 0
        assert all(hasattr(toolset, "_connection_params") for toolset in adk_toolsets)


@pytest.fixture
def aws_docs_mcp_config():
    return MCPServer(
        name="aws-docs",
        transport="stdio",
        command="uvx",
        args=["awslabs.aws-documentation-mcp-server@latest"],
        env={
            "FASTMCP_LOG_LEVEL": "ERROR",
            "AWS_DOCUMENTATION_PARTITION": "aws",
            "MCP_USER_AGENT": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_registry_spawns_and_communicates_with_real_server(
    aws_docs_mcp_config,
):
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry(configs=[aws_docs_mcp_config])

    assert registry.enabled
    assert "aws-docs" in registry.available_servers()

    async with registry.get_session("aws-docs"):
        tools = await registry.get_tools(name="aws-docs")

        assert len(tools) > 0

        tool_names = [str(tool) for tool in tools]
        assert any(
            "aws" in name.lower() or "search" in name.lower() for name in tool_names
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_registry_get_langchain_tools_from_live_server(aws_docs_mcp_config):
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry(configs=[aws_docs_mcp_config])

    async with registry.get_session("aws-docs"):
        langchain_tools = await registry.get_langchain_tools(name="aws-docs")

        assert len(langchain_tools) > 0
        assert all(
            hasattr(tool, "name") or hasattr(tool, "__name__")
            for tool in langchain_tools
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_registry_invokes_tool_from_live_server(aws_docs_mcp_config):
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry(configs=[aws_docs_mcp_config])

    async with registry.get_session("aws-docs"):
        langchain_tools = await registry.get_langchain_tools(name="aws-docs")

        assert len(langchain_tools) > 0

        search_tool = None
        for tool in langchain_tools:
            tool_name = getattr(tool, "name", None) or getattr(tool, "__name__", "")
            if "search" in tool_name.lower():
                search_tool = tool
                break

        assert search_tool is not None

        result = await search_tool.ainvoke({"search_phrase": "s3"})

        assert result is not None
        assert isinstance(result, list)
        assert len(result) > 0

        text_content = result[0]["text"]
        import json
        response = json.loads(text_content)

        assert "search_results" in response
        assert len(response["search_results"]) > 0
        assert any("s3" in r["url"].lower() for r in response["search_results"])
