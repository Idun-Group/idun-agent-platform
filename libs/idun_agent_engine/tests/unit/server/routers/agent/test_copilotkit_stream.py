"""Tests for CopilotKit streaming endpoint."""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path

from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.app_factory import create_app


@pytest.mark.unit
def test_copilotkit_stream_langgraph(tmp_path):
    """CopilotKit streaming with LangGraph agent."""
    db_path = tmp_path / "test.db"

    config_dict = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                "checkpointer": {
                    "type": "sqlite",
                    "db_url": f"sqlite:///{db_path}",
                },
            },
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        payload = {
            "threadId": "test-thread",
            "runId": "test-run",
            "state": {},
            "messages": [{"id": "msg-1", "role": "user", "content": "Hello"}],
            "tools": [],
            "context": [],
            "forwardedProps": {},
        }
        response = client.post("/agent/copilotkit/stream", json=payload)
        assert response.status_code == 200


@pytest.mark.unit
def test_copilotkit_stream_adk():
    """CopilotKit streaming with ADK agent."""
    mock_agent_path = (
        Path(__file__).parent.parent.parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )

    config_dict = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "ADK",
            "config": {
                "name": "ADK Test",
                "app_name": "test_adk",
                "agent": f"{mock_agent_path}:mock_adk_agent_instance",
            },
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        payload = {
            "threadId": "adk-thread",
            "runId": "adk-run",
            "state": {},
            "messages": [{"id": "msg-1", "role": "user", "content": "Hello"}],
            "tools": [],
            "context": [],
            "forwardedProps": {},
        }
        response = client.post("/agent/copilotkit/stream", json=payload)
        assert response.status_code == 200
