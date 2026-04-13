"""MCP server endpoint: exposes the agent as an MCP tool.

PINNED: mcp >=1.0.0,<2.0.0 (tested against 1.26.0)
We access mcp._tool_manager._tools to override the tool's input schema
for structured agents. This is a private attribute. If a future mcp release
changes it, _override_tool_schema() will log a warning and the tool will
still work but advertise a generic input schema.
"""

import json
import logging
import re
import uuid
from copy import deepcopy
from typing import Any

from ag_ui.core.events import RunErrorEvent, TextMessageContentEvent
from ag_ui.core.types import RunAgentInput, UserMessage
from idun_agent_schema.engine.capabilities import AgentCapabilities
from mcp.server.fastmcp import FastMCP

from ..agent.base import BaseAgent

logger = logging.getLogger(__name__)


def _sanitize_tool_name(name: str) -> str:
    """Convert an agent name to a valid MCP tool name ([A-Za-z0-9._-]{1,128})."""
    sanitized = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    sanitized = sanitized.strip("_")[:128]
    return sanitized or "agent"


def _override_tool_schema(
    mcp: FastMCP, tool_name: str, schema: dict[str, Any]
) -> None:
    """Override a registered tool's input schema.

    Accesses mcp._tool_manager._tools (private API, tested against mcp 1.26.0).
    Logs a warning and continues if the internal structure has changed.
    """
    try:
        tool = mcp._tool_manager._tools[tool_name]
        tool.parameters = schema
        logger.debug("Overrode tool schema for '%s'", tool_name)
    except (AttributeError, KeyError):
        logger.warning(
            "⚠️ Could not override MCP tool schema for '%s'. "
            "The mcp library internals may have changed. "
            "The tool will work but advertise a generic input schema.",
            tool_name,
        )


def _make_run_input(thread_id: str, content: str) -> RunAgentInput:
    """Build a RunAgentInput with all required fields."""
    return RunAgentInput(  # type: ignore[call-arg]
        threadId=thread_id,
        runId=f"mcp_{uuid.uuid4()}",
        state={},
        messages=[
            UserMessage(id=str(uuid.uuid4()), role="user", content=content),
        ],
        tools=[],
        context=[],
        forwardedProps={},
    )


async def _collect_response(agent: BaseAgent, run_input: RunAgentInput) -> str:
    """Run the agent and collect the full text response from AG-UI events."""
    chunks: list[str] = []
    error_message: str | None = None

    async for event in agent.run(run_input):
        if isinstance(event, TextMessageContentEvent):
            chunks.append(event.delta)
        elif isinstance(event, RunErrorEvent):
            error_message = event.message
            logger.error(
                "Agent returned error — thread=%s error=%s",
                run_input.thread_id, error_message,
            )

    if error_message and not chunks:
        return f"Error: {error_message}"

    if not chunks:
        logger.warning(
            "Agent returned no text content — thread=%s", run_input.thread_id
        )

    return "".join(chunks)


def _format_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, default=str)
    except (TypeError, ValueError):
        return str(result)


def create_mcp_server(
    agent: BaseAgent,
    capabilities: AgentCapabilities,
    description: str | None = None,
) -> FastMCP:
    """Create a FastMCP server exposing the agent as a single tool.

    Raises ValueError if the agent does not support the run() interface.
    """
    agent_name = getattr(agent, "name", "Agent")
    tool_name = _sanitize_tool_name(agent_name)
    tool_description = description or f"Invoke the {agent_name} agent"
    is_structured = (
        capabilities.input.mode == "structured" and capabilities.input.schema_
    )

    # Haystack agents don't implement run() — fail early
    from ..agent.haystack.haystack import HaystackAgent

    if isinstance(agent, HaystackAgent):
        raise ValueError(
            f"Agent '{agent_name}' (Haystack) does not support the run() "
            "interface, cannot expose as MCP server"
        )

    mcp = FastMCP(name=agent_name, streamable_http_path="/")

    if is_structured:

        async def structured_handler(input_data: dict) -> str:
            """Invoke the agent with structured input."""
            data = dict(input_data)
            session_id = data.pop("_mcp_session_id", None) or str(uuid.uuid4())
            logger.info(
                "MCP structured call — tool=%s thread=%s", tool_name, session_id
            )
            try:
                run_input = RunAgentInput(  # type: ignore[call-arg]
                    threadId=session_id,
                    runId=f"mcp_{uuid.uuid4()}",
                    state=data,
                    messages=[],
                    tools=[],
                    context=[],
                    forwardedProps={},
                )
                response = await _collect_response(agent, run_input)
                logger.debug(
                    "MCP structured response — tool=%s thread=%s len=%d",
                    tool_name, session_id, len(response),
                )
                return _format_result(response)
            except Exception:
                logger.exception(
                    "MCP tool invocation failed — tool=%s thread=%s",
                    tool_name, session_id,
                )
                return "Error: the agent encountered an internal error"

        mcp.add_tool(
            structured_handler,
            name=tool_name,
            description=tool_description,
        )

        schema = deepcopy(capabilities.input.schema_)
        _override_tool_schema(mcp, tool_name, {
            "type": "object",
            "properties": {"input_data": schema},
            "required": ["input_data"],
        })

    else:

        async def chat_handler(message: str, session_id: str = "") -> str:
            """Send a message to the agent and get a response."""
            sid = session_id or str(uuid.uuid4())
            logger.info("MCP chat call — tool=%s thread=%s", tool_name, sid)
            logger.debug(
                "MCP chat message — tool=%s content=%s", tool_name, message[:120]
            )
            try:
                run_input = _make_run_input(sid, message)
                response = await _collect_response(agent, run_input)
                logger.debug(
                    "MCP chat response — tool=%s thread=%s len=%d",
                    tool_name, sid, len(response),
                )
                return _format_result(response)
            except Exception:
                logger.exception(
                    "MCP tool invocation failed — tool=%s thread=%s",
                    tool_name, sid,
                )
                return "Error: the agent encountered an internal error"

        mcp.add_tool(
            chat_handler,
            name=tool_name,
            description=tool_description,
        )

    logger.info(
        "🔌 MCP server created — agent='%s' tool='%s' mode=%s",
        agent_name, tool_name, "structured" if is_structured else "chat",
    )
    return mcp
