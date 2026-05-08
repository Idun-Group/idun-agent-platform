"""Unit tests for the AG-UI SSE parser. No LLM, no subprocess."""

from __future__ import annotations

import pytest

from tests.e2e.helpers.aguievents import (
    AGUIEvent,  # noqa: F401  (public-API surface check)
    assert_envelope_complete,
    assert_event_sequence,
    assert_response_contains,
    assert_response_non_empty,
    assert_tool_called_once,
    parse_sse_lines,
)

SAMPLE_LINES = [
    'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}',
    "",
    'data: {"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}',
    "",
    'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"Hello, "}',
    "",
    'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"world!"}',
    "",
    'data: {"type":"TEXT_MESSAGE_END","messageId":"m1"}',
    "",
    'data: {"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}',
    "",
]


def test_parse_sse_lines_extracts_events():
    events = parse_sse_lines(SAMPLE_LINES)
    assert [e["type"] for e in events] == [
        "RUN_STARTED",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "RUN_FINISHED",
    ]


def test_assert_envelope_complete_passes_on_valid():
    events = parse_sse_lines(SAMPLE_LINES)
    assert_envelope_complete(events)  # does not raise


def test_assert_envelope_complete_fails_on_missing_finished():
    events = parse_sse_lines(SAMPLE_LINES[:-2])
    with pytest.raises(AssertionError):
        assert_envelope_complete(events)


def test_assert_event_sequence_matches_pattern():
    events = parse_sse_lines(SAMPLE_LINES)
    assert_event_sequence(
        events,
        [
            "RUN_STARTED",
            "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT+",
            "TEXT_MESSAGE_END",
            "RUN_FINISHED",
        ],
    )


def test_assert_response_non_empty_returns_concat():
    events = parse_sse_lines(SAMPLE_LINES)
    text = assert_response_non_empty(events)
    assert text == "Hello, world!"


def test_assert_response_contains_substring():
    events = parse_sse_lines(SAMPLE_LINES)
    assert_response_contains(events, "world")


def test_assert_tool_called_once():
    tool_lines = [
        'data: {"type":"TOOL_CALL_START","toolCallId":"c1","toolCallName":"multiply"}',
        "",
        'data: {"type":"TOOL_CALL_ARGS","toolCallId":"c1","delta":"{\\"a\\":47,\\"b\\":13}"}',
        "",
        'data: {"type":"TOOL_CALL_END","toolCallId":"c1"}',
        "",
    ]
    events = parse_sse_lines(tool_lines)
    assert_tool_called_once(events, "multiply")
