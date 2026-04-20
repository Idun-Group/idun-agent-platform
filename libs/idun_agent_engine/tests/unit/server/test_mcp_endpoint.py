"""Tests for MCP server endpoint module."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from ag_ui.core.events import (
    EventType,
    RunErrorEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
)
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.capabilities import (
    AgentCapabilities,
    CapabilityFlags,
    InputDescriptor,
    OutputDescriptor,
)

from idun_agent_engine.server.mcp_endpoint import (
    _collect_response,
    _filter_state_by_schema,
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

OUTPUT_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
}

CHAT_IN_STRUCTURED_OUT_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="chat"),
    output=OutputDescriptor(mode="structured", schema_=OUTPUT_ANSWER_SCHEMA),
)

STRUCTURED_IN_STRUCTURED_OUT_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="structured", schema_=STRUCTURED_SCHEMA),
    output=OutputDescriptor(mode="structured", schema_=OUTPUT_ANSWER_SCHEMA),
)


def _state_event(snapshot):
    return StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=snapshot)


def _text_event(delta: str, message_id: str = "m1"):
    return TextMessageContentEvent(
        type=EventType.TEXT_MESSAGE_CONTENT, message_id=message_id, delta=delta,
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


# ---------------------------------------------------------------------------
# _filter_state_by_schema
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFilterStateBySchema:
    def test_keeps_only_matching_keys(self):
        state = {"answer": "42", "messages": [1, 2], "internal": True}
        schema = {"properties": {"answer": {"type": "string"}}}
        assert _filter_state_by_schema(state, schema) == {"answer": "42"}

    def test_multiple_properties(self):
        state = {"a": 1, "b": 2, "c": 3}
        schema = {"properties": {"a": {}, "b": {}}}
        assert _filter_state_by_schema(state, schema) == {"a": 1, "b": 2}

    def test_missing_properties_key(self):
        assert _filter_state_by_schema({"a": 1}, {"type": "object"}) == {}

    def test_none_schema(self):
        assert _filter_state_by_schema({"a": 1}, None) == {}

    def test_non_dict_properties(self):
        assert _filter_state_by_schema({"a": 1}, {"properties": []}) == {}

    def test_no_overlap(self):
        state = {"x": 1}
        schema = {"properties": {"y": {}}}
        assert _filter_state_by_schema(state, schema) == {}


# ---------------------------------------------------------------------------
# _collect_response — output mode matrix
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCollectResponseStructuredOutput:
    @pytest.mark.asyncio
    async def test_structured_state_filtered_by_schema(self):
        events = [_state_event({"answer": "42", "messages": ["internal"]})]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert json.loads(result) == {"answer": "42"}

    @pytest.mark.asyncio
    async def test_structured_full_state_when_no_schema_match(self):
        events = [_state_event({"foo": "bar", "baz": 1})]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert json.loads(result) == {"foo": "bar", "baz": 1}

    @pytest.mark.asyncio
    async def test_structured_full_state_when_schema_none(self):
        events = [_state_event({"foo": "bar"})]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=None,
        )
        assert json.loads(result) == {"foo": "bar"}

    @pytest.mark.asyncio
    async def test_structured_uses_last_state_snapshot(self):
        events = [
            _state_event({"answer": "draft"}),
            _state_event({"answer": "final"}),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert json.loads(result) == {"answer": "final"}

    @pytest.mark.asyncio
    async def test_structured_falls_back_to_text_when_no_state(self):
        """ADK-style: structured output delivered as JSON in a text message."""
        events = [_text_event('{"answer": "42"}')]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert result == '{"answer": "42"}'

    @pytest.mark.asyncio
    async def test_structured_state_preferred_over_text(self):
        events = [
            _text_event("partial stream text"),
            _state_event({"answer": "final"}),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert json.loads(result) == {"answer": "final"}

    @pytest.mark.asyncio
    async def test_structured_empty_state_falls_back_to_text(self):
        events = [_state_event({}), _text_event("hello")]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert result == "hello"

    @pytest.mark.asyncio
    async def test_structured_error_when_no_state_no_text(self):
        events = [
            RunErrorEvent(type=EventType.RUN_ERROR, message="boom", code="E"),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert result == "Error: boom"

    @pytest.mark.asyncio
    async def test_structured_empty_when_no_events(self):
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter([]))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert result == ""

    @pytest.mark.asyncio
    async def test_structured_non_dict_state_ignored(self):
        """A snapshot that isn't a dict is ignored; falls back to text."""
        events = [_state_event("not a dict"), _text_event("fallback")]  # type: ignore[arg-type]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"),
            output_mode="structured", output_schema=OUTPUT_ANSWER_SCHEMA,
        )
        assert result == "fallback"


@pytest.mark.unit
class TestCollectResponseTextOutput:
    @pytest.mark.asyncio
    async def test_text_mode_ignores_state_snapshots(self):
        events = [
            _state_event({"answer": "in state"}),
            _text_event("hello from stream"),
        ]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(
            agent, _make_run_input("t", "hi"), output_mode="text",
        )
        assert result == "hello from stream"

    @pytest.mark.asyncio
    async def test_text_mode_default(self):
        """Default mode is 'text' — state snapshots ignored."""
        events = [_state_event({"answer": "x"}), _text_event("plain")]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        result = await _collect_response(agent, _make_run_input("t", "hi"))
        assert result == "plain"


# ---------------------------------------------------------------------------
# Handler invocation — input × output matrix
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestHandlerOutputModeMatrix:
    """End-to-end matrix: every (input, output) combo the platform supports."""

    @pytest.mark.asyncio
    async def test_chat_in_text_out(self):
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter([_text_event("hi back")]))

        mcp = create_mcp_server(agent, CHAT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "hello"})
        assert result == "hi back"

    @pytest.mark.asyncio
    async def test_chat_in_structured_out_state_based(self):
        """LangGraph-style: chat in, structured result written to state."""
        events = [_state_event({"answer": "forty-two", "messages": [1]})]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, CHAT_IN_STRUCTURED_OUT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "what is 6x7?"})
        assert json.loads(result) == {"answer": "forty-two"}

    @pytest.mark.asyncio
    async def test_chat_in_structured_out_text_based(self):
        """ADK-style: chat in, structured result delivered as JSON text."""
        agent = _mock_agent()
        agent.run = MagicMock(
            return_value=_async_iter([_text_event('{"answer": "42"}')])
        )

        mcp = create_mcp_server(agent, CHAT_IN_STRUCTURED_OUT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "what is 6x7?"})
        assert result == '{"answer": "42"}'

    @pytest.mark.asyncio
    async def test_structured_in_text_out(self):
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter([_text_event("done")]))

        mcp = create_mcp_server(agent, STRUCTURED_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({
            "input_data": {"request_id": "r1", "objective": "test"}
        })
        assert result == "done"

    @pytest.mark.asyncio
    async def test_structured_in_structured_out(self):
        events = [_state_event({"answer": "ok", "trace": "ignored"})]
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter(events))

        mcp = create_mcp_server(agent, STRUCTURED_IN_STRUCTURED_OUT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({
            "input_data": {"request_id": "r1", "objective": "test"}
        })
        assert json.loads(result) == {"answer": "ok"}

    @pytest.mark.asyncio
    async def test_chat_in_structured_out_empty_returns_empty_string(self):
        """No state, no text, no error → empty string (regression for celeste bug)."""
        agent = _mock_agent()
        agent.run = MagicMock(return_value=_async_iter([]))

        mcp = create_mcp_server(agent, CHAT_IN_STRUCTURED_OUT_CAPS)
        tool = mcp._tool_manager._tools["Test_Agent"]
        result = await tool.run({"message": "anything"})
        assert result == ""
