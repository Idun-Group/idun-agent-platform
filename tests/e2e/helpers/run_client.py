"""Shared HTTP helpers for posting to /agent/run.

Used by every scenario that exercises a single AG-UI run via SSE.
Multi-turn scenarios use their own variant in test_multi_turn.py.
"""

import uuid
from typing import Any

import httpx

from tests.e2e.helpers.aguievents import AGUIEvent, parse_sse_lines


def post_run(base_url: str, message: str) -> list[AGUIEvent]:
    """POST one user message to /agent/run and return the parsed SSE events."""
    thread_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    body: dict[str, Any] = {
        "threadId": thread_id,
        "runId": run_id,
        "messages": [
            {"id": str(uuid.uuid4()), "role": "user", "content": message},
        ],
        "tools": [],
        "context": [],
        "state": {},
        "forwardedProps": {},
    }
    with httpx.Client(timeout=120.0) as client:
        with client.stream(
            "POST",
            f"{base_url}/agent/run",
            json=body,
            headers={"Accept": "text/event-stream"},
        ) as r:
            assert r.status_code == 200, r.read()
            return parse_sse_lines(r.iter_lines())
