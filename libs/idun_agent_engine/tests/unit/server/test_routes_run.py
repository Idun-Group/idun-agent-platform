"""Tests for /agent/run and /agent/capabilities routes."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


def _make_config(graph_name: str = "graph") -> dict:
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_agent",
                "graph_definition": f"{mock_graph_path}:{graph_name}",
            },
        },
    }


@pytest.mark.unit
class TestCapabilitiesRoute:
    """Test /agent/capabilities endpoint."""

    def test_capabilities_chat(self):
        """GET /agent/capabilities returns chat mode for chat agent."""
        config = ConfigBuilder.from_dict(_make_config("graph")).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/agent/capabilities")
            assert response.status_code == 200
            data = response.json()
            assert data["input"]["mode"] == "chat"
            assert data["framework"] == "LANGGRAPH"

    def test_capabilities_structured(self):
        """GET /agent/capabilities returns structured mode for structured agent."""
        config = ConfigBuilder.from_dict(_make_config("structured_io_graph")).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/agent/capabilities")
            assert response.status_code == 200
            data = response.json()
            assert data["input"]["mode"] == "structured"
            assert data["output"]["mode"] == "structured"
            assert "user_input" in json.dumps(data["input"]["schema"])


@pytest.mark.unit
class TestRunRoute:
    """Test /agent/run endpoint."""

    def test_run_chat(self):
        """POST /agent/run with chat message returns SSE stream with events."""
        config = ConfigBuilder.from_dict(_make_config("graph")).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.post(
                "/agent/run",
                json={
                    "threadId": "test-thread",
                    "runId": "test-run",
                    "state": {},
                    "messages": [{"id": "msg_1", "role": "user", "content": "Hello"}],
                    "tools": [],
                    "context": [],
                    "forwardedProps": {},
                },
                headers={"Accept": "text/event-stream"},
            )
            assert response.status_code == 200


@pytest.mark.unit
class TestDeprecatedInvokeRoute:
    """Test that deprecated /agent/invoke still works."""

    def test_deprecated_invoke_still_works(self):
        """POST /agent/invoke (deprecated) should still work."""
        config = ConfigBuilder.from_dict(_make_config("graph")).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={"query": "Hello", "session_id": "test-123"},
            )
            assert response.status_code == 200
            data = response.json()
            assert "response" in data
