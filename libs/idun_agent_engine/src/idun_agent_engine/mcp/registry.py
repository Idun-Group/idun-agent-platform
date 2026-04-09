"""Registry for MCP server clients."""

from __future__ import annotations

import logging
import sys
from typing import TYPE_CHECKING, Any, cast

from idun_agent_schema.engine.mcp_server import MCPServer
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection

if TYPE_CHECKING:
    from google.adk.tools import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import (
        SseConnectionParams,
        StdioConnectionParams,
        StreamableHTTPConnectionParams,
    )
    from mcp import StdioServerParameters

try:
    from google.adk.tools import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import (
        SseConnectionParams,
        StdioConnectionParams,
        StreamableHTTPConnectionParams,
    )
    from mcp import StdioServerParameters
except ImportError:
    McpToolset = None  # type: ignore
    StdioConnectionParams = None  # type: ignore
    StdioServerParameters = None  # type: ignore
    SseConnectionParams = None  # type: ignore
    StreamableHTTPConnectionParams = None  # type: ignore


class _DeepcopySafeStderr:
    """Stderr proxy that survives ``copy.deepcopy`` / ``model_copy(deep=True)``.

    Google ADK ``McpToolset`` stores an ``errlog`` attribute that defaults to
    ``sys.stderr`` (a ``TextIOWrapper``).  ``TextIOWrapper`` cannot be pickled
    or deep-copied, which causes ``ag_ui_adk`` to crash when it deep-copies
    the ADK agent.

    This thin wrapper delegates writes to the *current* ``sys.stderr`` at call
    time (so it follows any runtime reassignment) and simply returns ``self``
    on ``__deepcopy__`` — there is no mutable state to duplicate.
    """

    def write(self, s: str) -> int:
        return sys.stderr.write(s)

    def flush(self) -> None:
        sys.stderr.flush()

    def writable(self) -> bool:
        return True

    def fileno(self) -> int:
        return sys.stderr.fileno()

    def __deepcopy__(self, memo: dict[int, Any]) -> _DeepcopySafeStderr:
        return self


logger = logging.getLogger(__name__)


def _sanitize_schema(schema: Any) -> None:
    """Recursively patch array nodes missing ``items`` in JSON Schema.

    Some MCP servers omit ``items`` on array properties. Most LLM providers
    reject these with a 400 error, so we default to ``{"type": "string"}``.
    """
    if isinstance(schema, dict):
        if schema.get("type") == "array" and "items" not in schema:
            schema["items"] = {"type": "string"}
            logger.warning(
                "MCP tool schema had array without 'items', defaulted to string: %s",
                schema,
            )
        for value in schema.values():
            _sanitize_schema(value)
    elif isinstance(schema, list):
        for item in schema:
            _sanitize_schema(item)


_active_registry: MCPClientRegistry | None = None


def set_active_registry(registry: MCPClientRegistry | None) -> None:
    """Set the process-wide active MCP registry.

    Called by the engine lifespan on startup so that helper functions
    (get_langchain_tools, get_adk_tools) can resolve tools from memory
    instead of re-fetching from the manager API.
    """
    global _active_registry
    _active_registry = registry


def get_active_registry() -> MCPClientRegistry | None:
    """Return the active MCP registry, or None if not set."""
    return _active_registry


class MCPClientRegistry:
    """Wraps `MultiServerMCPClient` with convenience helpers."""

    def __init__(self, configs: list[MCPServer] | None = None) -> None:
        self._configs = configs or []
        self._client: MultiServerMCPClient | None = None

        if self._configs:
            connections: dict[str, Connection] = {}
            for config in self._configs:
                try:
                    connections[config.name] = cast(
                        Connection, config.as_connection_dict()
                    )
                except Exception:
                    logger.exception(
                        "⚠️ Failed to build connection for MCP server '%s', skipping.",
                        config.name,
                    )

            if connections:
                try:
                    self._client = MultiServerMCPClient(connections)
                except Exception:
                    logger.exception(
                        "⚠️ Failed to create MultiServerMCPClient, "
                        "continuing without MCP servers."
                    )

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
        tools = await self._client.get_tools(server_name=name)
        for tool in tools:
            if hasattr(tool, "args_schema"):
                _sanitize_schema(tool.args_schema)
        return tools

    async def get_langchain_tools(self, name: str | None = None) -> list[Any]:
        """Alias for get_tools to make intent explicit when using LangChain/LangGraph agents."""
        return await self.get_tools(name=name)

    def get_adk_toolsets(self) -> list[Any]:
        """Return a list of Google ADK McpToolset instances for configured servers."""
        if McpToolset is None or StdioServerParameters is None:
            raise ImportError(
                "google-adk and mcp packages are required for ADK toolsets."
            )

        safe_errlog = _DeepcopySafeStderr()
        toolsets = []
        for config in self._configs:
            connection_params: Any = None

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

                connection_params = (
                    StdioConnectionParams(server_params=server_params)
                    if StdioConnectionParams is not None
                    else server_params
                )

            elif config.transport == "sse":
                if SseConnectionParams is None:
                    logger.warning(
                        "MCP server '%s': google-adk SseConnectionParams not available, skipping.",
                        config.name,
                    )
                    continue

                params: dict[str, Any] = {"url": config.url}
                if config.headers:
                    params["headers"] = config.headers
                if config.timeout_seconds is not None:
                    params["timeout"] = config.timeout_seconds
                if config.sse_read_timeout_seconds is not None:
                    params["sse_read_timeout"] = config.sse_read_timeout_seconds

                connection_params = SseConnectionParams(**params)

            elif config.transport == "streamable_http":
                if StreamableHTTPConnectionParams is None:
                    logger.warning(
                        "MCP server '%s': google-adk StreamableHTTPConnectionParams not available, skipping.",
                        config.name,
                    )
                    continue

                params = {"url": config.url}
                if config.headers:
                    params["headers"] = config.headers
                if config.timeout_seconds is not None:
                    params["timeout"] = config.timeout_seconds
                if config.sse_read_timeout_seconds is not None:
                    params["sse_read_timeout"] = config.sse_read_timeout_seconds
                if config.terminate_on_close is not None:
                    params["terminate_on_close"] = config.terminate_on_close

                connection_params = StreamableHTTPConnectionParams(**params)

            elif config.transport == "websocket":
                logger.warning(
                    "MCP server '%s': websocket transport is not supported by ADK toolsets, skipping.",
                    config.name,
                )
                continue

            else:
                logger.warning(
                    "MCP server '%s': unsupported transport '%s', skipping.",
                    config.name,
                    config.transport,
                )
                continue

            try:
                toolset = McpToolset(
                    connection_params=connection_params,
                    errlog=safe_errlog,
                )
                toolsets.append(toolset)
            except Exception:
                logger.exception(
                    "Failed to create ADK toolset for MCP server '%s', skipping.",
                    config.name,
                )

        return toolsets
