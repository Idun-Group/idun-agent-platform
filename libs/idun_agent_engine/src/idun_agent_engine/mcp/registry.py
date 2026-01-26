"""Registry for MCP server clients."""

from __future__ import annotations

from typing import Any, cast, TYPE_CHECKING

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection

if TYPE_CHECKING:
    from google.adk.tools import McpToolset
    from mcp import StdioServerParameters

try:
    from google.adk.tools import McpToolset
    from mcp import StdioServerParameters
except ImportError:
    McpToolset = None  # type: ignore
    StdioServerParameters = None  # type: ignore

from idun_agent_schema.engine.mcp_server import MCPServer


class MCPClientRegistry:
    """Wraps `MultiServerMCPClient` with convenience helpers."""

    def __init__(self, configs: list[MCPServer] | None = None) -> None:
        self._configs = configs or []
        self._client: MultiServerMCPClient | None = None

        if self._configs:
            connections: dict[str, Connection] = {
                config.name: cast(Connection, config.as_connection_dict())
                for config in self._configs
            }
            self._client = MultiServerMCPClient(connections)

    @property
    def enabled(self) -> bool:
        """Return True if at least one MCP server is configured."""
        return self._client is not None

    @property
    def client(self) -> MultiServerMCPClient:
        """Return the underlying MultiServerMCPClient."""
        if not self._client:
            raise RuntimeError("No MCP servers configured.")
        return self._client

    def available_servers(self) -> list[str]:
        """Return the list of configured MCP server names."""
        if not self._client:
            return []
        return list(self._client.connections.keys())

    def _ensure_server(self, name: str) -> None:
        if not self._client:
            raise RuntimeError("MCP client registry is not enabled.")
        if name not in self._client.connections:
            available = ", ".join(self._client.connections.keys()) or "none"
            raise ValueError(
                f"MCP server '{name}' is not configured. Available: {available}"
            )

    def get_client(self, name: str | None = None) -> MultiServerMCPClient:
        """Return the MCP client, optionally ensuring a named server exists."""
        if name:
            self._ensure_server(name)
        return self.client

    def get_session(self, name: str):
        """Return an async context manager for the given server session."""
        self._ensure_server(name)
        return self.client.session(name)

    async def get_tools(self, name: str | None = None) -> list[Any]:
        """Load tools from all servers or a specific one."""
        if not self._client:
            raise RuntimeError("MCP client registry is not enabled.")
        return await self._client.get_tools(server_name=name)

    async def get_langchain_tools(self, name: str | None = None) -> list[Any]:
        """
        Alias for get_tools to make intent explicit when using LangChain/LangGraph agents.
        """
        return await self.get_tools(name=name)

    def get_adk_toolsets(self) -> list[Any]:
        """Return a list of Google ADK McpToolset instances for configured servers."""
        if McpToolset is None or StdioServerParameters is None:
            raise ImportError(
                "google-adk and mcp packages are required for ADK toolsets."
            )

        toolsets = []
        for config in self._configs:
            if config.transport == "stdio":
                if not config.command:
                    continue

                server_params = StdioServerParameters(
                    command=config.command,
                    args=config.args,
                    env=config.env,
                    cwd=config.cwd,
                    encoding=config.encoding or "utf-8",
                    encoding_error_handler=config.encoding_error_handler or "strict",
                )

                toolset = McpToolset(
                    # name=config.name,
                    connection_params=server_params
                )
                toolsets.append(toolset)
            # TODO: Add support for SSE/HTTP transports when available in ADK/MCP

        return toolsets
