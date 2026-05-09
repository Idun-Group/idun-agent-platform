"""Scenario 6 — MCP roundtrip via the official mcp-server-time MCP."""

from __future__ import annotations

import datetime as dt
import re

import pytest

from tests.e2e.helpers.aguievents import (
    AGUIEvent,
    assert_envelope_complete,
    assert_response_non_empty,
)
from tests.e2e.helpers.mcp_servers import SERVER_TIME_ARGS, SERVER_TIME_COMMAND
from tests.e2e.helpers.run_client import post_run

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_with_mcp.py"
ADK_AGENT = "tests/e2e/fixtures/agents/agent_adk_with_mcp.py"

# mcp-server-time emits ISO-8601 timestamps; the agent's reply usually
# echoes the value verbatim. We accept any ISO-ish year-month-day-hour
# match (with or without seconds) so the assertion isn't brittle to
# minor formatting variations between providers.
_ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


def _assert_iso_timestamp_visible(events: list[AGUIEvent]) -> None:
    """Assert an ISO-8601-ish timestamp appears in text deltas or tool results.

    LangGraph adapters synthesize a follow-up TEXT_MESSAGE_CONTENT after
    the tool returns. ADK+Gemini frequently treats the TOOL_CALL_RESULT
    as the final response and never emits a follow-up text message — the
    timestamp is still visible to an AG-UI consumer through the
    TOOL_CALL_RESULT ``content`` field. Accept either delivery shape.
    Mirrors ``_assert_result_visible`` in test_tool_call.py.
    """
    text_parts = "".join(
        e.get("delta", "") for e in events if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    tool_parts = " ".join(
        str(e.get("content", "")) for e in events if e.get("type") == "TOOL_CALL_RESULT"
    )
    combined = f"{text_parts} {tool_parts}"
    match = _ISO_RE.search(combined)
    assert match, (
        f"expected ISO-8601-ish timestamp in text deltas ({text_parts!r}) "
        f"or tool-call results ({tool_parts!r})"
    )
    parsed = dt.datetime.fromisoformat(match.group(0))
    assert parsed.year >= 2025, f"sanity: timestamp before 2025: {parsed}"


@pytest.mark.pair("lg-openai")
def test_mcp_roundtrip_langgraph(pair, render_config, standalone_with_config) -> None:
    config = render_config(
        "lg_with_mcp.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
        mcp_command=SERVER_TIME_COMMAND,
        mcp_args=SERVER_TIME_ARGS,
    )
    with standalone_with_config(config) as base_url:
        events = post_run(
            base_url,
            "Use the get_current_time tool with timezone UTC and reply with "
            "the timestamp value only.",
        )
    assert_envelope_complete(events)
    # LangGraph reliably synthesizes a final text reply containing the
    # timestamp — assert both the text-channel and the broader visibility
    # check, so this side of the matrix stays the strict version.
    assert_response_non_empty(events)
    _assert_iso_timestamp_visible(events)


@pytest.mark.pair("adk-gemini")
def test_mcp_roundtrip_adk(pair, render_config, standalone_with_config) -> None:
    config = render_config(
        "adk_with_mcp.yaml.j2",
        port=0,
        agent_module_path=ADK_AGENT,
        mcp_command=SERVER_TIME_COMMAND,
        mcp_args=SERVER_TIME_ARGS,
    )
    with standalone_with_config(config) as base_url:
        events = post_run(
            base_url,
            "Use the time tool to get the current UTC time and reply with the "
            "timestamp value only.",
        )
    assert_envelope_complete(events)
    _assert_iso_timestamp_visible(events)
