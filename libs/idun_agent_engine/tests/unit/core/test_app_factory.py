"""Tests for the app factory and configuration loading."""

import pytest
import yaml
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig


@pytest.mark.unit
class TestAppFactoryConfigSources:
    """Test create_app with different configuration sources."""

    def test_create_app_with_yaml_config(self, tmp_path):
        """App can be created from a YAML config file."""
        config_data = {
            "server": {"api": {"port": 8888}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "YAML Test Agent",
                    "graph_definition": "./test/graph.py:app",
                    "observability": {"provider": "langfuse", "enabled": False},
                },
            },
        }

        config_file = tmp_path / "test_config.yaml"
        config_file.write_text(yaml.dump(config_data))

        app = create_app(config_path=str(config_file))
        client = TestClient(app)

        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

        assert app.state.engine_config.server.api.port == 8888
        assert app.state.engine_config.agent.config.name == "YAML Test Agent"

    def test_create_app_config_priority_order(self, tmp_path):
        """EngineConfig takes precedence over dict_config over file config."""
        file_config = {
            "server": {"api": {"port": 7777}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "File Agent", "graph_definition": "file.py:graph"},
            },
        }

        dict_config = {
            "server": {"api": {"port": 8888}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {"name": "Dict Agent", "graph_definition": "dict.py:graph"},
            },
        }

        engine_config = EngineConfig.model_validate(
            {
                "server": {"api": {"port": 9999}},
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "Engine Agent",
                        "graph_definition": "engine.py:graph",
                    },
                },
            }
        )

        config_file = tmp_path / "priority.yaml"
        config_file.write_text(yaml.dump(file_config))

        app = create_app(
            config_path=str(config_file),
            config_dict=dict_config,
            engine_config=engine_config,
        )

        assert app.state.engine_config.server.api.port == 9999
        assert app.state.engine_config.agent.config.name == "Engine Agent"

    def test_create_app_with_checkpointer_config(self, tmp_path):
        """App config correctly parses checkpointer settings."""
        config_with_checkpointer = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Persistent Agent",
                    "graph_definition": "./agent.py:graph",
                    "checkpointer": {
                        "type": "sqlite",
                        "db_url": "sqlite:///test_checkpoint.db",
                    },
                },
            },
        }

        app = create_app(config_dict=config_with_checkpointer)

        agent_config = app.state.engine_config.agent.config

        assert agent_config.checkpointer.type == "sqlite"
        assert "test_checkpoint.db" in agent_config.checkpointer.db_url


@pytest.mark.unit
class TestAppFactoryRoutes:
    """Test basic routes on the created app."""

    def test_health_and_root_routes(self, tmp_path) -> None:
        """Health and landing routes respond as expected."""
        app = create_app(
            config_dict={
                "server": {"api": {"port": 0}},
                "agent": {
                    "type": "LANGGRAPH",
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
