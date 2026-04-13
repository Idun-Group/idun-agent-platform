"""Tests for MCP server endpoint module."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from ag_ui.core.events import EventType, RunErrorEvent, TextMessageContentEvent
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.capabilities import (
    AgentCapabilities,
    CapabilityFlags,
    InputDescriptor,
    OutputDescriptor,
)

from idun_agent_engine.server.mcp_endpoint import (
    _collect_response,
    _format_result,
    _make_run_input,
    _override_tool_schema,
    _sanitize_tool_name,
    create_mcp_server,
)


async def _async_iter(items):
    for item in items:
        yield item


async def _async_raise(err):
    raise err
    yield  # noqa: RUF027


CHAT_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="chat"),
    output=OutputDescriptor(mode="text"),
)

STRUCTURED_SCHEMA = {
    "type": "object",
    "properties": {
        "request_id": {"type": "string"},
        "objective": {"type": "string"},
    },
    "required": ["request_id", "objective"],
}

STRUCTURED_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="structured", schema_=STRUCTURED_SCHEMA),
    output=OutputDescriptor(mode="structured"),
)

COMPLEX_SCHEMA = {
    "$defs": {
        "InputState": {
            "properties": {
                "request_id": {"type": "string"},
                "objective": {"type": "string"},
                "context": {
                    "additionalProperties": {"type": "string"},
                    "type": "object",
                },
                "constraints": {"items": {"type": "string"}, "type": "array"},
            },
            "required": ["request_id", "objective", "context", "constraints"],
            "type": "object",
        }
    },
    "$ref": "#/$defs/InputState",
}

COMPLEX_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="structured", schema_=COMPLEX_SCHEMA),
    output=OutputDescriptor(mode="structured"),
)


def _mock_agent(name: str = "Test Agent") -> MagicMock:
    agent = MagicMock()
    agent.name = name
    agent.run = MagicMock(return_value=_async_iter([]))
    return agent


# ---------------------------------------------------------------------------
# _sanitize_tool_name
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSanitizeToolName:
    def test_simple_name(self):
        assert _sanitize_tool_name("my-agent") == "my-agent"

    def test_spaces_replaced(self):
        assert _sanitize_tool_name("My Cool Agent") == "My_Cool_Agent"

    def test_special_chars_replaced(self):
        assert _sanitize_tool_name("agent@v2!") == "agent_v2"

    def test_dots_and_dashes_preserved(self):
        assert _sanitize_tool_name("agent.v2-beta") == "agent.v2-beta"

    def test_leading_trailing_underscores_stripped(self):
        assert _sanitize_tool_name("___agent___") == "agent"

    def test_empty_string_fallback(self):
        assert _sanitize_tool_name("") == "agent"

    def test_all_invalid_chars_fallback(self):
        assert _sanitize_tool_name("@#$%") == "agent"

    def test_truncated_to_128(self):
        name = "a" * 200
        assert len(_sanitize_tool_name(name)) == 128


# ---------------------------------------------------------------------------
# _make_run_input
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestMakeRunInput:
    def test_creates_valid_run_input(self):
        run_input = _make_run_input("thread-1", "hello")
        assert run_input.thread_id == "thread-1"
        assert run_input.run_id.startswith("mcp_")
        assert len(run_input.messages) == 1
        assert run_input.messages[0].content == "hello"
        assert run_input.messages[0].role == "user"
        assert run_input.state == {}
        assert run_input.tools == []
        assert run_input.context == []
        assert run_input.forwarded_props == {}

    def test_unique_run_ids(self):
        r1 = _make_run_input("t", "a")
        r2 = _make_run_input("t", "a")
        assert r1.run_id != r2.run_id

    def test_unique_message_ids(self):
        r1 = _make_run_input("t", "a")
        r2 = _make_run_input("t", "a")
        assert r1.messages[0].id != r2.messages[0].id


# ---------------------------------------------------------------------------
# _collect_response
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCollectResponse:
    @pytest.mark.asyncio
    async def test_collects_text_chunks(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="Hello ",
            ),
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="world!",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(agent, _make_run_input("t1", "hi"))
        assert result == "Hello world!"

    @pytest.mark.asyncio
    async def test_returns_error_on_run_error_event(self):
        events = [
            RunErrorEvent(
                type=EventType.RUN_ERROR, message="Agent crashed", code="FRAMEWORK_ERROR",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(agent, _make_run_input("t1", "hi"))
        assert "Agent crashed" in result

    @pytest.mark.asyncio
    async def test_text_takes_precedence_over_error(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="partial",
            ),
            RunErrorEvent(type=EventType.RUN_ERROR, message="late error", code="ERR"),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(agent, _make_run_input("t1", "hi"))
        assert result == "partial"

    @pytest.mark.asyncio
    async def test_empty_response(self):
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter([]))

        result = await _collect_response(agent, _make_run_input("t1", "hi"))
        assert result == ""

    @pytest.mark.asyncio
    async def test_propagates_agent_exception(self):
        agent = _mock_agent()

        def failing_run(_):
            return _async_raise(RuntimeError("boom"))

        agent.run = failing_run

        with pytest.raises(RuntimeError, match="boom"):
            await _collect_response(agent, _make_run_input("t1", "hi"))


# ---------------------------------------------------------------------------
# _format_result
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFormatResult:
    def test_string_passthrough(self):
        assert _format_result("hello") == "hello"

    def test_dict_to_json(self):
        result = _format_result({"key": "value"})
        assert json.loads(result) == {"key": "value"}

    def test_list_to_json(self):
        result = _format_result([1, 2, 3])
        assert json.loads(result) == [1, 2, 3]

    def test_non_serializable_fallback(self):
        d: dict = {}
        d["self"] = d  # circular reference triggers ValueError
        result = _format_result(d)
        assert "self" in result


# ---------------------------------------------------------------------------
# _override_tool_schema
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestOverrideToolSchema:
    def test_overrides_schema(self):
        from mcp.server.fastmcp import FastMCP

        async def dummy() -> str:
            return ""

        mcp = FastMCP("test")
        mcp.add_tool(dummy, name="tool")
        new_schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        _override_tool_schema(mcp, "tool", new_schema)
        assert mcp._tool_manager._tools["tool"].parameters == new_schema

    def test_warns_on_missing_tool(self):
        from mcp.server.fastmcp import FastMCP

        mcp = FastMCP("test")
        _override_tool_schema(mcp, "nonexistent", {})


# ---------------------------------------------------------------------------
# create_mcp_server
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCreateMCPServerChat:
    def test_creates_server_with_chat_tool(self):
        agent = _mock_agent()
        mcp = create_mcp_server(agent, CHAT_CAPS)
        assert mcp.name == "Test Agent"
        assert "Test_Agent" in mcp._tool_manager._tools

    def test_chat_tool_schema_has_message_and_session_id(self):
        agent = _mock_agent()
        mcp = create_mcp_server(agent, CHAT_CAPS)
        schema = mcp._tool_manager._tools["Test_Agent"].parameters
        assert "message" in schema["properties"]
        assert "session_id" in schema["properties"]
        assert "message" in schema["required"]

    def test_sanitized_tool_name(self):
        agent = _mock_agent("My Cool Agent!!")
        mcp = create_mcp_server(agent, CHAT_CAPS)
        assert "My_Cool_Agent" in mcp._tool_manager._tools

    def test_default_tool_description(self):
        agent = _mock_agent("My Bot")
        mcp = create_mcp_server(agent, CHAT_CAPS)
        tool = mcp._tool_manager._tools["My_Bot"]
        assert tool.description == "Invoke the My Bot agent"

    def test_custom_description(self):
        agent = _mock_agent("My Bot")
        mcp = create_mcp_server(agent, CHAT_CAPS, description="A helpful bot")
        tool = mcp._tool_manager._tools["My_Bot"]
        assert tool.description == "A helpful bot"

    def test_custom_description_none_falls_back(self):
        agent = _mock_agent("My Bot")
        mcp = create_mcp_server(agent, CHAT_CAPS, description=None)
        tool = mcp._tool_manager._tools["My_Bot"]
        assert tool.description == "Invoke the My Bot agent"

    def test_custom_description_empty_falls_back(self):
        agent = _mock_agent("My Bot")
        mcp = create_mcp_server(agent, CHAT_CAPS, description="")
        tool = mcp._tool_manager._tools["My_Bot"]
        assert tool.description == "Invoke the My Bot agent"

    def test_fallback_name_when_agent_has_no_name(self):
        agent = MagicMock(spec=[])  # no name attribute
        mcp = create_mcp_server(agent, CHAT_CAPS)
        assert "Agent" in mcp._tool_manager._tools

    def test_structured_mode_false_when_schema_is_none(self):
        caps = AgentCapabilities(
            framework=AgentFramework.LANGGRAPH,
            capabilities=CapabilityFlags(),
            input=InputDescriptor(mode="structured"),
            output=OutputDescriptor(mode="text"),
        )
        agent = _mock_agent()
        mcp = create_mcp_server(agent, caps)
        schema = mcp._tool_manager._tools["Test_Agent"].parameters
        assert "message" in schema["properties"]


@pytest.mark.unit
class TestCreateMCPServerStructured:
    def test_creates_server_with_structured_tool(self):
        agent = _mock_agent()
        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        assert "Test_Agent" in mcp._tool_manager._tools

    def test_structured_tool_schema_wraps_in_input_data(self):
        agent = _mock_agent()
        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        schema = mcp._tool_manager._tools["Test_Agent"].parameters
        assert "input_data" in schema["properties"]
        assert "input_data" in schema["required"]
        inner = schema["properties"]["input_data"]
        assert "request_id" in inner["properties"]
        assert "objective" in inner["properties"]

    def test_complex_schema_with_defs_and_ref(self):
        agent = _mock_agent()
        mcp = create_mcp_server(agent, COMPLEX_CAPS)
        schema = mcp._tool_manager._tools["Test_Agent"].parameters
        inner = schema["properties"]["input_data"]
        assert "$defs" in inner
        assert "$ref" in inner

    def test_schema_is_deep_copied(self):
        agent = _mock_agent()
        original = STRUCTURED_CAPS.input.schema_
        create_mcp_server(agent, STRUCTURED_CAPS)
        assert original == STRUCTURED_SCHEMA


@pytest.mark.unit
class TestCreateMCPServerHaystack:
    def test_raises_for_haystack_agent(self):
        from idun_agent_engine.agent.haystack.haystack import HaystackAgent

        agent = HaystackAgent()
        agent._name = "Haystack Agent"
        with pytest.raises(ValueError, match="does not support the run"):
            create_mcp_server(agent, CHAT_CAPS)


# ---------------------------------------------------------------------------
# Handler invocation
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestChatHandlerInvocation:
    @pytest.mark.asyncio
    async def test_calls_agent_run(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="Hi back!",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, CHAT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "hello", "session_id": "s1"})
        assert result == "Hi back!"
        agent.run.assert_called_once()
        call_input = agent.run.call_args[0][0]
        assert call_input.thread_id == "s1"
        assert call_input.messages[0].content == "hello"

    @pytest.mark.asyncio
    async def test_generates_session_id_when_empty(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="ok",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, CHAT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        await tool.run({"message": "hello"})
        call_input = agent.run.call_args[0][0]
        assert len(call_input.thread_id) > 0

    @pytest.mark.asyncio
    async def test_returns_generic_error_on_exception(self):
        agent = _mock_agent()
        agent.run = AsyncMock(side_effect=RuntimeError("kaboom"))

        mcp = create_mcp_server(agent, CHAT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "hello"})
        assert result == "Error: the agent encountered an internal error"


@pytest.mark.unit
class TestStructuredHandlerInvocation:
    @pytest.mark.asyncio
    async def test_calls_agent_run(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="done",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({
            "input_data": {"request_id": "r1", "objective": "test"}
        })
        assert result == "done"
        agent.run.assert_called_once()
        call_input = agent.run.call_args[0][0]
        assert call_input.messages == []
        assert call_input.state["request_id"] == "r1"
        assert call_input.state["objective"] == "test"

    @pytest.mark.asyncio
    async def test_pops_mcp_session_id(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="ok",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        await tool.run({
            "input_data": {
                "request_id": "r1",
                "objective": "test",
                "_mcp_session_id": "my-session",
            }
        })
        call_input = agent.run.call_args[0][0]
        assert call_input.thread_id == "my-session"
        assert call_input.messages == []
        assert "_mcp_session_id" not in call_input.state
        assert call_input.state["request_id"] == "r1"

    @pytest.mark.asyncio
    async def test_generates_session_id_when_missing(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="ok",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        await tool.run({
            "input_data": {"request_id": "r1", "objective": "test"}
        })
        call_input = agent.run.call_args[0][0]
        assert len(call_input.thread_id) > 0

    @pytest.mark.asyncio
    async def test_empty_input_data(self):
        events = [
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id="m1", delta="ok",
            ),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"input_data": {}})
        assert result == "ok"
        call_input = agent.run.call_args[0][0]
        assert call_input.state == {}
        assert call_input.messages == []

    @pytest.mark.asyncio
    async def test_returns_generic_error_on_exception(self):
        agent = _mock_agent()
        agent.run = AsyncMock(side_effect=RuntimeError("kaboom"))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({
            "input_data": {"request_id": "r1", "objective": "test"}
        })
        assert result == "Error: the agent encountered an internal error"
