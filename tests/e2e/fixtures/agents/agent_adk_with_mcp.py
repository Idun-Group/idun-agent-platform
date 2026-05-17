"""ADK agent built from MCP toolsets resolved by the engine registry.

The engine sets the active ``MCPClientRegistry`` before loading the
agent module; ``get_adk_tools()`` is the public, sync helper that
returns the registry-resolved ADK toolsets (a list of
``McpToolset`` instances). ``get_adk_toolsets`` is a registry method,
not a top-level helper — the PLAN's draft import was wrong.
"""

import os

from google.adk.agents import LlmAgent
from idun_agent_engine.mcp.helpers import get_adk_tools


def _make() -> LlmAgent:
    model = os.environ.get("E2E_MODEL", "gemini-3-flash-preview")
    toolsets = get_adk_tools()
    return LlmAgent(
        name="e2e_adk_mcp",
        model=model,
        instruction=(
            "When the user asks for the time, ALWAYS call the "
            "get_current_time tool with timezone='UTC'. The tool's "
            "response is your answer."
        ),
        tools=list(toolsets),
    )


root_agent: LlmAgent = _make()
