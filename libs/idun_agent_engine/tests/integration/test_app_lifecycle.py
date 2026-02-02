"""Integration tests for full app lifecycle.

These tests verify that the app starts up correctly, handles requests,
and shuts down cleanly with real (non-mocked) components.
"""

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app


@pytest.mark.integration
class TestAppStartup:
    """Test app startup and basic route availability."""

    def test_app_starts_and_responds_to_health(self):
        """App starts successfully and health endpoint responds."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Startup Test Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json()["status"] == "healthy"

    def test_app_exposes_root_info(self):
        """App root endpoint returns agent information."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Info Test Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.get("/")
            assert response.status_code == 200
            data = response.json()
            assert "agent_endpoints" in data


@pytest.mark.integration
class TestAppConfiguration:
    """Test app with various configuration options."""

    def test_app_with_custom_port(self):
        """App respects custom port configuration."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 9999}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Custom Port Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        )

        # Verify config was applied
        assert app.state.engine_config.server.api.port == 9999

    def test_app_with_disabled_observability(self):
        """App works with observability explicitly disabled."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "No Observability Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                        "observability": {
                            "provider": "langfuse",
                            "enabled": False,
                        },
                    },
                },
            }
        )

        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
