"""Tests for agent router endpoints with real agents."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
class TestAgentInvokeRoute:
    """Test /agent/invoke endpoint."""

    def test_invoke_with_langgraph_agent(self):
        """Invoke endpoint with LangGraph mock agent."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Test LangGraph Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={"session_id": "test-123", "query": "Hello"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == "test-123"
            assert "response" in data

    def test_invoke_with_haystack_agent(self):
        """Invoke endpoint with Haystack mock agent."""
        mock_pipeline_path = (
            Path(__file__).parent.parent.parent.parent.parent
            / "fixtures"
            / "agents"
            / "mock_haystack_pipeline.py"
        )

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "HAYSTACK",
                "config": {
                    "name": "Test Haystack Agent",
                    "component_type": "pipeline",
                    "component_definition": f"{mock_pipeline_path}:mock_haystack_pipeline",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.post(
                "/agent/invoke",
                json={"session_id": "haystack-123", "query": "Test query"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == "haystack-123"
            assert "response" in data


@pytest.mark.unit
class TestAgentStreamRoute:
    """Test /agent/stream endpoint."""

    def test_stream_with_langgraph_agent(self):
        """Stream endpoint with LangGraph mock agent."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Test LangGraph Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.post(
                "/agent/stream",
                json={"session_id": "test-456", "query": "Stream test"},
            )

            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]
            assert len(response.text) > 0


@pytest.mark.unit
class TestAgentConfigRoute:
    """Test /agent/config endpoint."""

    def test_get_config(self):
        """Config endpoint returns agent configuration."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Config Test Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/agent/config")

            assert response.status_code == 200
            data = response.json()
            assert "config" in data


@pytest.mark.unit
class TestAgentConfigRouteErrors:
    """Test /agent/config endpoint error cases."""

    def test_get_config_not_available(self):
        """Config endpoint returns 404 when engine_config not set."""
        from fastapi import FastAPI
        from idun_agent_engine.server.routers.agent import agent_router

        app = FastAPI()
        app.include_router(agent_router)

        with TestClient(app) as client:
            response = client.get("/config")

            assert response.status_code == 404
            assert "Configuration not available" in response.json()["detail"]


@pytest.mark.unit
class TestInvokeErrorHandling:
    """Test error handling in invoke endpoint."""

    def test_invoke_error_handling(self):
        """Invoke endpoint handles agent errors."""
        from unittest.mock import AsyncMock, patch

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Test LangGraph Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            with patch.object(
                app.state.agent,
                "invoke",
                AsyncMock(side_effect=Exception("Agent failure")),
            ):
                response = client.post(
                    "/agent/invoke",
                    json={"session_id": "error-test", "query": "Trigger error"},
                )

                assert response.status_code == 500
                assert "Agent failure" in response.json()["detail"]


@pytest.mark.unit
class TestReloadEndpoint:
    """Test /reload endpoint."""

    def test_reload_from_file(self, tmp_path):
        """Reload endpoint loads new config from file."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Initial Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        new_config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Reloaded Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config_file = tmp_path / "reload_config.yaml"
        import yaml

        config_file.write_text(yaml.dump(new_config_dict))

        with TestClient(app) as client:
            response = client.post("/reload", json={"path": str(config_file)})

            assert response.status_code == 200
            assert response.json()["status"] == "success"

    def test_reload_missing_env_vars(self):
        """Reload endpoint returns 400 when env vars missing."""
        import os
        from unittest.mock import patch

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Test Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            with patch.dict(os.environ, {}, clear=True):
                response = client.post("/reload", json={})

                assert response.status_code == 400
                assert "IDUN_AGENT_API_KEY" in response.json()["detail"]


@pytest.mark.unit
class TestBaseRoutes:
    """Test base routes."""

    def test_health_check(self):
        """Health check endpoint returns status."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Health Test Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "engine_version" in data

    def test_root_endpoint(self):
        """Root endpoint returns service information."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Root Test Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                },
            },
        }

        config = ConfigBuilder.from_dict(config_dict).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/")

            assert response.status_code == 200
            data = response.json()
            assert "message" in data
            assert "docs" in data
            assert "health" in data
