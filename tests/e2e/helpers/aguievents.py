"""AG-UI SSE wire-format parser and loose-assertion vocabulary.

The engine emits AG-UI events as SSE on /agent/run with content-type
text/event-stream. Each event is `data: <json>\\n\\n`. Field names
are camelCase (Pydantic alias generator). EventType values are
uppercase snake.

We parse on the wire instead of importing ag_ui.core types so the
test layer only checks what a real HTTP consumer sees.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any, TypedDict, cast


class AGUIEvent(TypedDict, total=False):
    type: str
    threadId: str
    runId: str
    messageId: str
    role: str
    delta: str
    toolCallId: str
    toolCallName: str


def parse_sse_lines(lines: Iterable[str]) -> list[AGUIEvent]:
    """Parse SSE lines into typed AG-UI events.

    Lines come from `httpx.Response.iter_lines()` or a fixture. Empty
    separator lines are ignored. `data:` is the only field we care
    about; comments and other fields are dropped silently.
    """
    events: list[AGUIEvent] = []
    for raw in lines:
        line = raw.rstrip("\r\n")
        if not line.startswith("data:"):
            continue
        payload = line[len("data:") :].lstrip()
        if not payload or payload == "[DONE]":
            continue
        try:
            obj: Any = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "type" in obj:
            events.append(cast(AGUIEvent, obj))
    return events


def _types(events: Iterable[AGUIEvent]) -> list[str]:
    return [e.get("type", "") for e in events]


def assert_envelope_complete(events: list[AGUIEvent]) -> None:
    """Assert exactly one RUN_STARTED followed by exactly one RUN_FINISHED."""
    types = _types(events)
    starts = [i for i, t in enumerate(types) if t == "RUN_STARTED"]
    ends = [i for i, t in enumerate(types) if t == "RUN_FINISHED"]
    assert len(starts) == 1, f"expected 1 RUN_STARTED, got {len(starts)}: {types}"
    assert len(ends) == 1, f"expected 1 RUN_FINISHED, got {len(ends)}: {types}"
    assert starts[0] < ends[0], f"RUN_STARTED must precede RUN_FINISHED: {types}"


def assert_event_sequence(events: list[AGUIEvent], pattern: list[str]) -> None:
    """Assert the event-type stream matches a regex-like pattern.

    Pattern items: "Foo" (one), "Foo+" (>=1), "Foo*" (>=0).
    Other event types may appear before, between, or after matched tokens.
    """
    types = _types(events)
    flat = " ".join(types) + " "
    parts: list[str] = [r"(?:[A-Z_]+ )*"]  # allow extras before the first token
    for tok in pattern:
        if tok.endswith("+"):
            parts.append(rf"(?:{re.escape(tok[:-1])} )+")
        elif tok.endswith("*"):
            parts.append(rf"(?:{re.escape(tok[:-1])} )*")
        else:
            parts.append(rf"{re.escape(tok)} ")
        # allow other event types in between
        parts.append(r"(?:[A-Z_]+ )*")
    expected = "".join(parts)
    assert re.fullmatch(
        expected, flat
    ), f"event sequence does not match {pattern}\nactual: {types}"


def assert_response_non_empty(events: Iterable[AGUIEvent]) -> str:
    """Return the concatenated TEXT_MESSAGE_CONTENT delta and assert non-empty."""
    text = "".join(
        e.get("delta", "") for e in events if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    assert text.strip(), "no TEXT_MESSAGE_CONTENT payload received"
    return text


def assert_response_contains(events: Iterable[AGUIEvent], substring: str) -> None:
    """Assert the concatenated text response contains a deterministic substring."""
    text = "".join(
        e.get("delta", "") for e in events if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    assert (
        substring in text
    ), f"expected substring {substring!r} not found in response: {text!r}"


def assert_tool_called_once(events: Iterable[AGUIEvent], tool_name: str) -> None:
    """Assert exactly one ToolCallStart->ToolCallEnd triple for `tool_name`."""
    starts = [
        e
        for e in events
        if e.get("type") == "TOOL_CALL_START" and e.get("toolCallName") == tool_name
    ]
    ends = [
        e
        for e in events
        if e.get("type") == "TOOL_CALL_END"
        and any(s.get("toolCallId") == e.get("toolCallId") for s in starts)
    ]
    assert (
        len(starts) == 1
    ), f"expected 1 TOOL_CALL_START for {tool_name!r}, got {len(starts)}"
    assert (
        len(ends) == 1
    ), f"expected 1 matching TOOL_CALL_END for {tool_name!r}, got {len(ends)}"
