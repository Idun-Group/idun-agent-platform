import os

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
def test_ban_list_blocks_banned_word():
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
                    "config_id": "ban_list",
                    "api_key": api_key,
                    "reject_message": "Banned word detected",
                    "guard_url": "hub://guardrails/ban_list",
                    "guard_params": {"banned_words": ["badword"]},
                },
            ]
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/invoke",
            json={"session_id": "test-ban", "query": "This contains badword"},
        )
        assert response.status_code == 429
        assert "Banned word detected" in response.json()["detail"]


@pytest.mark.unit
def test_ban_list_allows_clean_text():
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
                    "config_id": "ban_list",
                    "api_key": api_key,
                    "reject_message": "Banned word detected",
                    "guard_url": "hub://guardrails/ban_list",
                    "guard_params": {"banned_words": ["badword"]},
                },
            ]
        },
    }

    config = ConfigBuilder.from_dict(config_dict).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/invoke",
            json={"session_id": "test-ban", "query": "Hello world"},
        )
        assert response.status_code == 200
        assert "response" in response.json()
