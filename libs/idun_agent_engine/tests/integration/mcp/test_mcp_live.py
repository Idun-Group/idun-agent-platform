import pytest

from idun_agent_schema.engine.mcp_server import MCPServer


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
async def test_mcp_registry_spawns_and_communicates_with_real_server(aws_docs_mcp_config):
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry(configs=[aws_docs_mcp_config])

    assert registry.enabled
    assert "aws-docs" in registry.available_servers()

    async with registry.get_session("aws-docs"):
        tools = await registry.get_tools(name="aws-docs")

        assert len(tools) > 0

        tool_names = [str(tool) for tool in tools]
        assert any("aws" in name.lower() or "search" in name.lower() for name in tool_names)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_registry_get_langchain_tools_from_live_server(aws_docs_mcp_config):
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry(configs=[aws_docs_mcp_config])

    async with registry.get_session("aws-docs"):
        langchain_tools = await registry.get_langchain_tools(name="aws-docs")

        assert len(langchain_tools) > 0
        assert all(hasattr(tool, "name") or hasattr(tool, "__name__") for tool in langchain_tools)
