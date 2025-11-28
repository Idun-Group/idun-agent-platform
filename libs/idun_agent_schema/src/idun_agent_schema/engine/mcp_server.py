"""MCP server configuration models (engine)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class MCPServer(BaseModel):
    """Configuration for a single MCP server connection."""

    name: str = Field(..., description="Unique identifier for this MCP server.")
    transport: Literal["stdio", "sse", "streamable_http", "websocket"] = Field(
        default="streamable_http",
        description="Transport type used to reach the MCP server.",
    )
    url: str | None = Field(
        default=None,
        description="Endpoint URL for HTTP/S based transports (SSE, streamable_http, websocket).",
    )
    command: str | None = Field(
        default=None, description="Executable to run when using stdio transport."
    )
    args: list[str] = Field(
        default_factory=list,
        description="Arguments to pass to the command for stdio transport.",
    )
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="Optional headers for HTTP/S transports.",
    )
    env: dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables to set when spawning stdio servers.",
    )
    cwd: str | None = Field(
        default=None, description="Working directory for stdio transports."
    )
    encoding: str | None = Field(
        default=None, description="Encoding used for stdio transport."
    )
    encoding_error_handler: Literal["strict", "ignore", "replace"] | None = Field(
        default=None, description="Encoding error handler for stdio transport."
    )
    timeout_seconds: float | None = Field(
        default=None,
        description="Timeout in seconds for HTTP/S transports (maps to `timeout`).",
    )
    sse_read_timeout_seconds: float | None = Field(
        default=None,
        description="Timeout in seconds waiting for SSE events (maps to `sse_read_timeout`).",
    )
    terminate_on_close: bool | None = Field(
        default=None,
        description="Whether to terminate Streamable HTTP sessions on close.",
    )
    session_kwargs: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra keyword arguments forwarded to MCP ClientSession.",
    )

    @model_validator(mode="after")
    def _validate_transport_fields(self) -> MCPServer:
        """Ensure required fields are present for the selected transport."""
        if self.transport in {"sse", "streamable_http", "websocket"} and not self.url:
            raise ValueError(f"url is required for transport '{self.transport}'")

        if self.transport == "stdio":
            if not self.command:
                raise ValueError("command is required for stdio transport")
            if not self.args:
                raise ValueError("args is required for stdio transport")

        return self

    def as_connection_dict(self) -> dict[str, Any]:
        """Convert the config into langchain-mcp-adapters connection payload."""
        connection: dict[str, Any] = {"transport": self.transport}

        if self.transport in {"sse", "streamable_http", "websocket"}:
            connection["url"] = self.url
            if self.headers:
                connection["headers"] = self.headers

        if self.transport == "sse":
            if self.timeout_seconds is not None:
                connection["timeout"] = self.timeout_seconds
            if self.sse_read_timeout_seconds is not None:
                connection["sse_read_timeout"] = self.sse_read_timeout_seconds

        if self.transport == "streamable_http":
            if self.timeout_seconds is not None:
                connection["timeout"] = timedelta(seconds=self.timeout_seconds)
            if self.sse_read_timeout_seconds is not None:
                connection["sse_read_timeout"] = timedelta(
                    seconds=self.sse_read_timeout_seconds
                )
            if self.terminate_on_close is not None:
                connection["terminate_on_close"] = self.terminate_on_close

        if self.transport == "stdio":
            connection["command"] = self.command
            connection["args"] = self.args
            if self.env:
                connection["env"] = self.env
            if self.cwd:
                connection["cwd"] = self.cwd
            if self.encoding:
                connection["encoding"] = self.encoding
            if self.encoding_error_handler:
                connection["encoding_error_handler"] = self.encoding_error_handler

        if self.session_kwargs:
            connection["session_kwargs"] = self.session_kwargs

        return connection
