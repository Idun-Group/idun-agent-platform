import os
import shutil

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder

# guardrails-ai is an opt-in extra; without it the `guardrails` CLI is absent
# and the guard cannot be built. Skip (rather than fail) so the suite degrades
# gracefully when the extra isn't installed. CI installs it via
# `uv sync --all-extras`, so these run there. Mirrors tests/conftest.py.
pytestmark = pytest.mark.skipif(
    shutil.which("guardrails") is None,
    reason="guardrails-ai optional extra not installed (no `guardrails` CLI on PATH)",
)


@pytest.mark.unit
def test_detect_pii_blocks_email():
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
                    "config_id": "detect_pii",
                    "api_key": api_key,
                    "reject_message": "PII detected",
                    "guard_url": "hub://guardrails/detect_pii",
                    "guard_params": {
                        "pii_entities": ["EMAIL_ADDRESS"],
                        "on_fail": "exception",
                    },
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
                "session_id": "test-pii",
                "query": "My email is test@example.com",
            },
        )
        assert response.status_code == 429
        assert "PII detected" in response.json()["detail"]


@pytest.mark.unit
def test_detect_pii_allows_no_pii():
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
                    "config_id": "detect_pii",
                    "api_key": api_key,
                    "reject_message": "PII detected",
                    "guard_url": "hub://guardrails/detect_pii",
                    "guard_params": {
                        "pii_entities": ["EMAIL_ADDRESS"],
                        "on_fail": "exception",
                    },
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
                "session_id": "test-pii",
                "query": "Hello, how are you?",
            },
        )
        assert response.status_code == 200
        assert "response" in response.json()
