"""Integration test: LangGraph node -> emit_surface -> /agent/run SSE.

Pins the end-to-end contract that an Idun agent emitting A2UI through
the SDK lands on the wire as a CUSTOM event named
``idun.a2ui.messages`` with the v0.9 envelope shape any A2UI client
can render.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.integration
def test_emit_surface_passes_through_agent_run_sse() -> None:
    """A graph that calls emit_surface emits a CUSTOM event with name
    ``idun.a2ui.messages`` on the /agent/run SSE stream."""
    config = ConfigBuilder.from_dict(
        {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "A2UI Fixture",
                    "graph_definition": (
                        "tests.fixtures.agents.mock_a2ui_graph:graph"
                    ),
                    "checkpointer": {"type": "memory"},
                },
            },
        }
    ).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "messages": [
                    {"id": "m1", "role": "user", "content": "go"},
                ],
                "state": {},
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200, response.text

        # EventEncoder emits frames as ``data: {JSON}\n\n``. Parse line
        # by line because individual JSON payloads may contain blank
        # values but never raw newlines.
        frames: list[dict] = []
        for line in response.text.split("\n"):
            if not line.startswith("data: "):
                continue
            payload = line[len("data: ") :].strip()
            if not payload:
                continue
            try:
                frames.append(json.loads(payload))
            except json.JSONDecodeError:
                continue

        assert frames, f"no SSE frames decoded; raw body:\n{response.text}"

        # At least one CUSTOM frame named idun.a2ui.messages must appear.
        a2ui_frames = [
            f
            for f in frames
            if f.get("type") in {"CUSTOM", "CustomEvent"}
            and f.get("name") == "idun.a2ui.messages"
        ]
        assert len(a2ui_frames) == 1, (
            f"Expected exactly one A2UI frame, got {len(a2ui_frames)}. "
            f"All frame types: {sorted({f.get('type') for f in frames})}"
        )

        envelope = a2ui_frames[0]["value"]
        assert envelope["a2uiVersion"] == "v0.9"
        assert envelope["surfaceId"] == "test_surface"
        assert envelope["fallbackText"] == "hello a2ui"
        assert len(envelope["messages"]) == 2
