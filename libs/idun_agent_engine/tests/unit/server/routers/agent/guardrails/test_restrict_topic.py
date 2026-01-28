import os

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.skip("this raises mutex errors", allow_module_level=True)
class TestRestrictTopic:
    def test_restrict_topic_blocks_off_topic(self):
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
                        "config_id": "restrict_to_topic",
                        "api_key": api_key,
                        "reject_message": "Off-topic content",
                        "guard_url": "hub://guardrails/restrict_to_topic",
                        "topics": ["technology", "programming"],
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
                    "session_id": "test-topic",
                    "query": "Who won the football game yesterday?",
                },
            )
            assert response.status_code == 429
            assert "Off-topic content" in response.json()["detail"]

    def test_restrict_topic_allows_on_topic(self):
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
                        "config_id": "restrict_to_topic",
                        "api_key": api_key,
                        "reject_message": "Off-topic content",
                        "guard_url": "hub://guardrails/restrict_to_topic",
                        "topics": ["technology", "programming"],
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
                    "session_id": "test-topic",
                    "query": "How do I write a Python function?",
                },
            )
            assert response.status_code == 200
            assert "response" in response.json()
