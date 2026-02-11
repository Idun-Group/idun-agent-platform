"""Integration tests for structured input schema handling via API."""

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app


@pytest.mark.integration
class TestInvokeEndpointWithStructuredInput:
    """Test /invoke endpoint with custom input schema."""

    def test_invoke_with_valid_structured_input(self):
        """Invoke endpoint with valid TaskRequest input."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Structured Input Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:structured_input_graph",
                        "input_schema_definition": "request",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={
                    "task_name": "Build feature",
                    "description": "Implement new functionality",
                    "priority": 3,
                    "tags": ["backend", "urgent"],
                    "assignee": "john",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "result" in data
            assert "Build feature" in data["result"]
            assert "priority: 3" in data["result"]

    def test_invoke_with_minimal_structured_input(self):
        """Invoke endpoint with only required fields."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Structured Input Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:structured_input_graph",
                        "input_schema_definition": "request",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={"task_name": "Simple task"},
            )

            assert response.status_code == 200
            data = response.json()
            assert "result" in data
            assert "Simple task" in data["result"]

    def test_invoke_structured_validation_error(self):
        """Invoke endpoint with invalid structured input returns 422."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Structured Input Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:structured_input_graph",
                        "input_schema_definition": "request",
                    },
                },
            }
        )

        with TestClient(app) as client:
            # Missing required field 'task_name'
            response = client.post(
                "/agent/invoke",
                json={"priority": 5},
            )

            assert response.status_code == 422
            assert "Validation error" or "loc" in response.json()  # noqa: SIM222


@pytest.mark.integration
class TestInvokeEndpointWithChatRequest:
    """Test /invoke endpoint with default ChatRequest."""

    def test_invoke_with_chat_request(self):
        """Invoke endpoint uses ChatRequest when no custom schema configured."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Chat Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={
                    "query": "Hello world",
                    "session_id": "test-session",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "session_id" in data
            assert "Hello world" in str(data["response"])

    def test_invoke_chat_request_validation_error(self):
        """Invoke endpoint with invalid ChatRequest returns 422."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Chat Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        )

        with TestClient(app) as client:
            # Missing required fields
            response = client.post(
                "/agent/invoke",
                json={"message": "Hello"},
            )

            assert response.status_code == 422
