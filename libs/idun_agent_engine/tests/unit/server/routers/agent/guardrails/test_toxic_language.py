import os

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.skip("this raises mutex errors", allow_module_level=True)
class TestToxicLanguage:
    def test_toxic_language_blocks_toxic_text(self):
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
                        "config_id": "toxic_language",
                        "api_key": api_key,
                        "reject_message": "Toxic language detected",
                        "guard_url": "hub://guardrails/toxic_language",
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
                    "session_id": "test-toxic",
                    "query": "I hate you, you are stupid and worthless",
                },
            )
            assert response.status_code == 429
            assert "Toxic language detected" in response.json()["detail"]

    def test_toxic_language_allows_clean_text(self):
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
                        "config_id": "toxic_language",
                        "api_key": api_key,
                        "reject_message": "Toxic language detected",
                        "guard_url": "hub://guardrails/toxic_language",
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
                    "session_id": "test-toxic",
                    "query": "Hello, how can I help you today?",
                },
            )
            assert response.status_code == 200
            assert "response" in response.json()
