"""Tests for the /agent/graph endpoint."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
class TestAgentGraphRoute:
    def test_returns_200_with_graph_key(self):
        config = ConfigBuilder.from_dict(
            {
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Test Agent",
                        "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                    },
                },
            }
        ).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/agent/graph")

        assert response.status_code == 200
        assert "graph" in response.json()

    def test_returns_404_for_non_langgraph(self):
        mock_path = (
            Path(__file__).resolve().parent.parent.parent.parent.parent
            / "fixtures"
            / "agents"
            / "mock_haystack_pipeline.py"
        )
        config = ConfigBuilder.from_dict(
            {
                "server": {"api": {"port": 8000}},
                "agent": {
                    "type": "HAYSTACK",
                    "config": {
                        "name": "Haystack Agent",
                        "component_type": "pipeline",
                        "component_definition": f"{mock_path}:mock_haystack_pipeline",
                    },
                },
            }
        ).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            response = client.get("/agent/graph")

        assert response.status_code == 404
