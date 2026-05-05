"""Tests for the /agent/graph, /agent/graph/mermaid, /agent/graph/ascii endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


def _langgraph_app():
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
    return create_app(engine_config=config)


def _haystack_app():
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
    return create_app(engine_config=config)


@pytest.mark.unit
class TestAgentGraphRoutes:
    def test_ir_route_returns_agent_graph(self) -> None:
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph")
        assert response.status_code == 200
        body = response.json()
        assert body["format_version"] == "1"
        assert "metadata" in body and "nodes" in body and "edges" in body
        assert body["metadata"]["framework"] == "LANGGRAPH"

    def test_mermaid_route_returns_string(self) -> None:
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/mermaid")
        assert response.status_code == 200
        body = response.json()
        assert "mermaid" in body
        assert isinstance(body["mermaid"], str) and body["mermaid"]

    def test_ascii_route_returns_string(self) -> None:
        app = _langgraph_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/ascii")
        assert response.status_code == 200
        body = response.json()
        assert "ascii" in body
        assert isinstance(body["ascii"], str) and body["ascii"]

    def test_ir_route_404_for_haystack(self) -> None:
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph")
        assert response.status_code == 404

    def test_mermaid_route_404_for_haystack(self) -> None:
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/mermaid")
        assert response.status_code == 404

    def test_ascii_route_404_for_haystack(self) -> None:
        app = _haystack_app()
        with TestClient(app) as client:
            response = client.get("/agent/graph/ascii")
        assert response.status_code == 404
