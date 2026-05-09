"""Helpers for the official ``mcp-server-time`` MCP server.

The standalone subprocess spawns the MCP child via the engine's
MCPClientRegistry; tests only need the resolved command/args to
render the YAML.

We use the Python-based ``mcp-server-time`` package via ``uvx``
rather than the npm ``@modelcontextprotocol/server-time`` referenced
in earlier drafts: that npm package was never published. The
upstream Anthropic MCP servers repo only ships a Python time server
under ``src/time/`` (PyPI: ``mcp-server-time``).
"""

from __future__ import annotations

SERVER_TIME_COMMAND = "uvx"
SERVER_TIME_ARGS = ["mcp-server-time", "--local-timezone", "UTC"]
