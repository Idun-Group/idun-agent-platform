"""Tests for agent router endpoints with mocked agents."""

import json
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from idun_agent_engine.server.routers.agent import agent_router


@pytest.mark.unit
class TestAgentInvokeRoute:
    """Test the /invoke endpoint with mocked agents."""

    def test_invoke_with_payload(self):
        """Invoke endpoint processes payload and returns response."""
        app = FastAPI()
        app.include_router(agent_router)

        mock_agent = AsyncMock()
        mock_agent.invoke = AsyncMock(return_value="Processed complex query")
        app.state.agent = mock_agent

        client = TestClient(app)

        complex_query = {
            "session_id": "complex-123",
            "query": "Analyze this data: "
            + json.dumps({"key": "value", "nested": {"data": [1, 2, 3]}}),
        }

        response = client.post("/invoke", json=complex_query)

        assert response.status_code == 200
        assert response.json()["session_id"] == "complex-123"
        mock_agent.invoke.assert_called_once()

        called_message = mock_agent.invoke.call_args[0][0]
        assert "Analyze this data" in called_message["query"]
        assert called_message["session_id"] == "complex-123"


@pytest.mark.unit
class TestAgentStreamRoute:
    """Test the /stream endpoint with mocked agents."""

    def test_stream_returns_event_stream_format(self):
        """Stream endpoint returns Server-Sent Events format."""
        app = FastAPI()
        app.include_router(agent_router)

        async def mock_stream(message):
            class Event:
                def model_dump_json(self):
                    return json.dumps({"event": "chunk", "data": "test"})

            for i in range(3):
                yield Event()

        mock_agent = AsyncMock()
        mock_agent.stream = mock_stream
        app.state.agent = mock_agent

        client = TestClient(app)

        response = client.post(
            "/stream", json={"session_id": "stream-test", "query": "Stream this"}
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        content = response.text
        assert "data: {" in content
        assert content.count("data: ") >= 3
