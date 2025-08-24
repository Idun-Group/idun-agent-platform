"""Tests for basic server routes."""

from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app


def test_health_and_root_routes(tmp_path) -> None:
    """Health and landing routes respond as expected."""
    app = create_app(
        config_dict={
            "server": {"api": {"port": 0}},
            "agent": {
                "type": "langgraph",
                "config": {
                    "name": "Test Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
        }
    )
    client = TestClient(app)

    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json().get("status") == "healthy"

    resp = client.get("/")
    assert resp.status_code == 200
    assert "agent_endpoints" in resp.json()
