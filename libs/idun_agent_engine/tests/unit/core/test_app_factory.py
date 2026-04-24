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
        assert response.json()["status"] == "ok"

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
        assert resp.json().get("status") == "ok"

        resp = client.get("/")
        assert resp.status_code == 200
        assert "agent_endpoints" in resp.json()


@pytest.mark.unit
class TestAppFactoryCors:
    """Test CORS and Private Network Access behavior on the created app."""

    def test_preflight_allows_any_origin_and_private_network(self, tmp_path) -> None:
        """Wildcard CORS should still return the private-network allow header."""
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

        response = client.options(
            "/reload",
            headers={
                "Origin": "https://cloud.idunplatform.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "https://cloud.idunplatform.com"
        )
        assert response.headers.get("access-control-allow-private-network") == "true"

    def test_preflight_allows_arbitrary_origin_with_wildcard_cors(
        self, tmp_path
    ) -> None:
        """Private-network support should apply even for non-cloud origins."""
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

        response = client.options(
            "/agent/capabilities",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "https://evil.example.com"
        )
        assert response.headers.get("access-control-allow-private-network") == "true"


def _minimal_config(tmp_path):
    return {
        "server": {"api": {"port": 0}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": str(tmp_path / "agent.py:graph"),
            },
        },
    }


@pytest.fixture
def ui_bundle(tmp_path):
    out = tmp_path / "bundle"
    out.mkdir()
    (out / "index.html").write_text(
        "<!doctype html><html><body>hello</body></html>"
    )
    return out


@pytest.mark.unit
class TestAppFactoryUI:
    """UI mount behavior at /: bundled default, --ui-dir override, JSON fallback."""

    def test_no_override_no_bundle_returns_json_welcome(
        self, tmp_path, monkeypatch
    ) -> None:
        """No bundled UI and no override -> GET / returns the JSON welcome."""
        import idun_agent_engine.core.app_factory as factory

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: None)

        app = create_app(config_dict=_minimal_config(tmp_path))
        client = TestClient(app)

        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert "agent_endpoints" in body

    def test_bundled_default_serves_index_html(
        self, tmp_path, monkeypatch, ui_bundle
    ) -> None:
        """Bundled UI detected -> GET / returns its index.html."""
        import idun_agent_engine.core.app_factory as factory

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: ui_bundle)

        app = create_app(config_dict=_minimal_config(tmp_path))
        client = TestClient(app)

        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/html")
        assert "hello" in resp.text

    def test_override_beats_bundled_default(
        self, tmp_path, monkeypatch
    ) -> None:
        """ui_dir_override wins over the bundled default."""
        import idun_agent_engine.core.app_factory as factory

        bundle = tmp_path / "bundle"
        bundle.mkdir()
        (bundle / "index.html").write_text(
            "<!doctype html><html><body>bundled</body></html>"
        )
        override = tmp_path / "override"
        override.mkdir()
        (override / "index.html").write_text(
            "<!doctype html><html><body>override</body></html>"
        )

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: bundle)

        app = create_app(
            config_dict=_minimal_config(tmp_path),
            ui_dir_override=str(override),
        )
        client = TestClient(app)

        resp = client.get("/")
        assert resp.status_code == 200
        assert "override" in resp.text
        assert "bundled" not in resp.text

    def test_override_missing_path_raises(self, tmp_path, monkeypatch) -> None:
        """Non-existent ui_dir_override path -> ValueError at create_app."""
        import idun_agent_engine.core.app_factory as factory

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: None)

        with pytest.raises(ValueError, match="does not exist"):
            create_app(
                config_dict=_minimal_config(tmp_path),
                ui_dir_override=str(tmp_path / "does-not-exist"),
            )

    def test_override_missing_index_html_raises(
        self, tmp_path, monkeypatch
    ) -> None:
        """ui_dir_override without an index.html -> ValueError at create_app."""
        import idun_agent_engine.core.app_factory as factory

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: None)
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()

        with pytest.raises(ValueError, match="index.html"):
            create_app(
                config_dict=_minimal_config(tmp_path),
                ui_dir_override=str(empty_dir),
            )

    def test_explicit_routes_win_over_ui_mount(
        self, tmp_path, monkeypatch, ui_bundle
    ) -> None:
        """With UI mounted, explicit API routes still respond (not shadowed)."""
        import idun_agent_engine.core.app_factory as factory

        monkeypatch.setattr(factory, "_find_bundled_ui", lambda: ui_bundle)

        app = create_app(config_dict=_minimal_config(tmp_path))
        client = TestClient(app)

        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json().get("status") == "ok"

        resp = client.get("/docs")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

        # /agent/capabilities is registered via app.include_router. The mount
        # at / must not shadow it. Without lifespan (no agent init) the route
        # returns an error, but it is NOT the UI's index.html.
        resp = client.get("/agent/capabilities")
        assert resp.status_code != 404
        assert "hello" not in resp.text
