"""Google ADK agent wired to two MCP servers via Idun Engine.

``get_adk_tools()`` reads the engine's in-memory MCP registry (set by
``server/lifespan.py`` after ``config.yaml`` is parsed) and returns
ADK ``McpToolset`` instances. Pass them straight to the ``tools=``
argument of ``google.adk.agents.Agent``; the toolsets handle invocation
against each underlying MCP server.
"""

from google.adk.agents import Agent
from idun_agent_engine.mcp import get_adk_tools


root_agent = Agent(
    model="gemini-2.5-flash",
    name="mcp_adk",
    description="ADK agent that answers questions using MCP-provided tools.",
    instruction=(
        "You are a research assistant. Use the available MCP tools to find "
        "information before answering. Cite the source (Idun docs, "
        "data.gouv.fr, etc.) in your reply."
    ),
    tools=get_adk_tools(),
)
