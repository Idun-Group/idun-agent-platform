"""Tests for agent router endpoints with real agents."""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path


from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
@pytest.mark.asyncio
class TestAgentInvokeRoute:
    """Test /agent/invoke endpoint."""

    async def test_invoke_with_langgraph_agent(self):
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

    async def test_invoke_with_haystack_agent(self):
        """Invoke endpoint with Haystack mock agent."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "HAYSTACK",
                "config": {
                    "name": "Test Haystack Agent",
                    "component_type": "pipeline",
                    "component_definition": "tests/fixtures/agents/mock_haystack_pipeline.py:mock_haystack_pipeline",
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
@pytest.mark.asyncio
class TestAgentStreamRoute:
    """Test /agent/stream endpoint."""

    async def test_stream_with_langgraph_agent(self):
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
@pytest.mark.asyncio
class TestAgentConfigRoute:
    """Test /agent/config endpoint."""

    async def test_get_config(self):
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
@pytest.mark.asyncio
class TestAgentConfigRouteErrors:
    """Test /agent/config endpoint error cases."""

    async def test_get_config_not_available(self):
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
@pytest.mark.asyncio
class TestInvokeErrorHandling:
    """Test error handling in invoke endpoint."""

    async def test_invoke_error_handling(self):
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
@pytest.mark.asyncio
class TestReloadEndpoint:
    """Test /reload endpoint."""

    async def test_reload_from_file(self, tmp_path):
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

    async def test_reload_missing_env_vars(self):
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


@pytest.mark.unit
@pytest.mark.asyncio
class TestMultipleGuardrailsBlocking:
    """Test multiple guardrails blocking different types of content."""

    async def test_multiple_guardrails_ban_list_triggers(self):
        """BanList guardrail triggers on banned words."""
        import os

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            pytest.skip("GUARDRAILS_API_KEY not set")

        config = ConfigBuilder.from_file(
            "tests/fixtures/configs/guardrail.yaml"
        ).build()
        app = create_app(engine_config=config)

        with TestClient(app) as client:
            # Test BanList triggers
            response = client.post(
                "/agent/invoke",
                json={"session_id": "test-ban", "query": "This contains badword"},
            )
            assert response.status_code == 429
            assert "Banned word detected" in response.json()["detail"]

    async def test_multiple_guardrails_pii_triggers(self):
        """DetectPII guardrail triggers on PII."""
        import os

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
            # Test DetectPII triggers
            response = client.post(
                "/agent/invoke",
                json={
                    "session_id": "test-pii",
                    "query": "My email is test@example.com",
                },
            )
            assert response.status_code == 429
            assert "PII detected" in response.json()["detail"]

    async def test_multiple_guardrails_toxic_triggers(self):
        """ToxicLanguage guardrail triggers on toxic content."""
        import os

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
            # Test ToxicLanguage triggers
            response = client.post(
                "/agent/invoke",
                json={
                    "session_id": "test-toxic",
                    "query": "I hate you, you are stupid and worthless",
                },
            )
            assert response.status_code == 429
            assert "Toxic language detected" in response.json()["detail"]

    async def test_multiple_guardrails_nsfw_triggers(self):
        """NSFWText guardrail triggers on NSFW content."""
        import os

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
            # Test NSFWText triggers
            response = client.post(
                "/agent/invoke",
                json={
                    "session_id": "test-nsfw",
                    "query": "explicit sexual content here",
                },
            )
            assert response.status_code == 429
            assert "NSFW content detected" in response.json()["detail"]

    async def test_multiple_guardrails_restrict_topic_triggers(self):
        """RestrictToTopic guardrail triggers on off-topic content."""
        import os

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
            # Test RestrictToTopic triggers
            response = client.post(
                "/agent/invoke",
                json={
                    "session_id": "test-topic",
                    "query": "Who won the football game yesterday?",
                },
            )
            assert response.status_code == 429
            assert "Off-topic content" in response.json()["detail"]
