"""Integration tests for MCP SSE/HTTP transport support (issue #404).

Spins up real local FastMCP servers and verifies that MCPClientRegistry
creates correct ADK toolsets and LangChain tools for SSE and
streamable_http transports.
"""

import asyncio
import socket

import pytest
import uvicorn
from idun_agent_schema.engine.mcp_server import MCPServer
from mcp.server.fastmcp import FastMCP

from idun_agent_engine.mcp.registry import MCPClientRegistry


def _free_port() -> int:
    # TOCTOU race possible but acceptable in test environments.
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


async def _start_server(server, timeout: float = 5.0):
    """Start a uvicorn server and wait until it is ready."""
    task = asyncio.create_task(server.serve())
    for _ in range(int(timeout * 10)):
        await asyncio.sleep(0.1)
        if server.started:
            return task
    task.cancel()
    pytest.fail("FastMCP server failed to start within timeout")


async def _stop_server(server, task, timeout: float = 5.0):
    """Gracefully stop a uvicorn server."""
    server.should_exit = True
    try:
        await asyncio.wait_for(task, timeout=timeout)
    except (TimeoutError, Exception):
        task.cancel()


@pytest.fixture
async def local_sse_server():
    """Local FastMCP server with SSE transport."""
    mcp = FastMCP("test-sse")

    @mcp.tool()
    def echo(text: str) -> str:
        """Echo back the input text."""
        return f"echo: {text}"

    @mcp.tool()
    def add(a: float, b: float) -> float:
        """Add two numbers."""
        return a + b

    port = _free_port()
    app = mcp.sse_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    task = await _start_server(server)

    yield f"http://127.0.0.1:{port}/sse"

    await _stop_server(server, task)


@pytest.fixture
async def local_streamable_http_server():
    """Local FastMCP server with streamable HTTP transport."""
    mcp = FastMCP("test-http")

    @mcp.tool()
    def echo(text: str) -> str:
        """Echo back the input text."""
        return f"echo: {text}"

    @mcp.tool()
    def multiply(a: float, b: float) -> float:
        """Multiply two numbers."""
        return a * b

    port = _free_port()
    app = mcp.streamable_http_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    task = await _start_server(server)

    yield f"http://127.0.0.1:{port}/mcp"

    await _stop_server(server, task)


# -- LangChain tools: discovery -------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_langchain_tools_from_sse_server(local_sse_server):
    """LangChain tools load from a real SSE MCP server."""
    config = MCPServer(name="local-sse", transport="sse", url=local_sse_server)
    registry = MCPClientRegistry(configs=[config])

    async with registry.get_session("local-sse"):
        tools = await registry.get_langchain_tools(name="local-sse")
        assert len(tools) >= 2
        tool_names = [t.name for t in tools]
        assert "echo" in tool_names
        assert "add" in tool_names


@pytest.mark.integration
@pytest.mark.asyncio
async def test_langchain_tools_from_streamable_http_server(
    local_streamable_http_server,
):
    """LangChain tools load from a real streamable HTTP MCP server."""
    config = MCPServer(
        name="local-http",
        transport="streamable_http",
        url=local_streamable_http_server,
    )
    registry = MCPClientRegistry(configs=[config])

    async with registry.get_session("local-http"):
        tools = await registry.get_langchain_tools(name="local-http")
        assert len(tools) >= 2
        tool_names = [t.name for t in tools]
        assert "echo" in tool_names
        assert "multiply" in tool_names


# -- LangChain tools: invocation ------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_langchain_tool_invocation_over_sse(local_sse_server):
    """Invoke a tool over SSE and verify the result."""
    config = MCPServer(name="local-sse", transport="sse", url=local_sse_server)
    registry = MCPClientRegistry(configs=[config])

    async with registry.get_session("local-sse"):
        tools = await registry.get_langchain_tools(name="local-sse")
        add_tool = next(t for t in tools if t.name == "add")
        result = await add_tool.ainvoke({"a": 3, "b": 7})
        # MCP tools return a list of content blocks: [{"type": "text", "text": "10.0", ...}]
        text = result[0]["text"] if isinstance(result, list) else str(result)
        assert float(text) == 10.0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_langchain_tool_invocation_over_streamable_http(
    local_streamable_http_server,
):
    """Invoke a tool over streamable HTTP and verify the result."""
    config = MCPServer(
        name="local-http",
        transport="streamable_http",
        url=local_streamable_http_server,
    )
    registry = MCPClientRegistry(configs=[config])

    async with registry.get_session("local-http"):
        tools = await registry.get_langchain_tools(name="local-http")
        multiply_tool = next(t for t in tools if t.name == "multiply")
        result = await multiply_tool.ainvoke({"a": 5, "b": 6})
        text = result[0]["text"] if isinstance(result, list) else str(result)
        assert float(text) == 30.0


# -- ADK toolsets ---------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_adk_toolset_sse_transport(local_sse_server):
    """ADK toolset from SSE config has correct connection params type."""
    config = MCPServer(name="local-sse", transport="sse", url=local_sse_server)
    registry = MCPClientRegistry(configs=[config])

    toolsets = registry.get_adk_toolsets()
    assert len(toolsets) == 1

    # Verify tools can be loaded through the ADK toolset
    tools = await toolsets[0].get_tools()
    tool_names = [t.name for t in tools]
    assert "echo" in tool_names
    assert "add" in tool_names


@pytest.mark.integration
@pytest.mark.asyncio
async def test_adk_toolset_streamable_http_transport(local_streamable_http_server):
    """ADK toolset from streamable_http config has correct connection params type."""
    config = MCPServer(
        name="local-http",
        transport="streamable_http",
        url=local_streamable_http_server,
    )
    registry = MCPClientRegistry(configs=[config])

    toolsets = registry.get_adk_toolsets()
    assert len(toolsets) == 1

    tools = await toolsets[0].get_tools()
    tool_names = [t.name for t in tools]
    assert "echo" in tool_names
    assert "multiply" in tool_names
