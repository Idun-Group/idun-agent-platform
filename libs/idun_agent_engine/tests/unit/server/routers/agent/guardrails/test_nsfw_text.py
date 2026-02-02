import os

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
def test_nsfw_text_blocks_nsfw_content():
    api_key = os.getenv("GUARDRAILS_API_KEY")
    if not api_key:
        pytest.skip("GUARDRAILS_API_KEY not set")

    config_dict = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
            },
        },
        "guardrails": {
            "input": [
                {
                    "config_id": "nsfw_text",
                    "api_key": api_key,
                    "reject_message": "NSFW content detected",
                    "guard_url": "hub://guardrails/nsfw_text",
                    "threshold": 0.5,
                },
            ]
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/invoke",
            json={
                "session_id": "test-nsfw",
                "query": "explicit sexual content here",
            },
        )
        assert response.status_code == 429
        assert "NSFW content detected" in response.json()["detail"]


@pytest.mark.unit
def test_nsfw_text_allows_clean_content():
    api_key = os.getenv("GUARDRAILS_API_KEY")
    if not api_key:
        pytest.skip("GUARDRAILS_API_KEY not set")

    config_dict = {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
            },
        },
        "guardrails": {
            "input": [
                {
                    "config_id": "nsfw_text",
                    "api_key": api_key,
                    "reject_message": "NSFW content detected",
                    "guard_url": "hub://guardrails/nsfw_text",
                    "threshold": 0.5,
                },
            ]
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/invoke",
            json={
                "session_id": "test-nsfw",
                "query": "Tell me about the weather today",
            },
        )
        assert response.status_code == 200
        assert "response" in response.json()
