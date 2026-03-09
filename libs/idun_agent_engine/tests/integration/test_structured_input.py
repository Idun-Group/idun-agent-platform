"""Integration tests for invoke endpoint with ChatRequest input.

The input_schema_definition field has been removed. All invoke requests
now use the default ChatRequest model (query + session_id).
"""

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app


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


@pytest.mark.integration
class TestAdkInvokeEndpointWithChatRequest:
    """Test /invoke endpoint with ADK default ChatRequest."""

    def test_adk_invoke_with_chat_request(self):
        from pathlib import Path

        mock_agent_path = (
            Path(__file__).parent.parent / "fixtures" / "agents" / "mock_adk_agent.py"
        )

        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "ADK",
                    "config": {
                        "name": "ADK Chat Agent",
                        "app_name": "adk_chat_test",
                        "agent": f"{mock_agent_path}:mock_adk_agent_instance",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={
                    "query": "Hello ADK",
                    "session_id": "test-session",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "session_id" in data
            assert "Hello ADK" in str(data["response"])

    def test_adk_invoke_chat_request_validation_error(self):
        from pathlib import Path

        mock_agent_path = (
            Path(__file__).parent.parent / "fixtures" / "agents" / "mock_adk_agent.py"
        )

        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "ADK",
                    "config": {
                        "name": "ADK Chat Agent",
                        "app_name": "adk_chat_test",
                        "agent": f"{mock_agent_path}:mock_adk_agent_instance",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={"message": "Hello"},
            )

            assert response.status_code == 422
