"""Tests for the engine's unconfigured boot mode.

When ``create_app()`` is called with no config sources and no
``./config.yaml`` is present, the engine boots with routes registered
but no agent. ``/agent/*`` returns 503 ``agent_not_ready`` until an
embedder calls ``configure_app(app, config)``. ``/health`` and the
base routes work normally throughout.

Contract documented in ``idun_agent_engine.core.app_factory.create_app``.
Embedders that depend on this behavior: ``idun-agent-standalone`` (boots
admin-only when the wizard hasn't materialized an agent yet).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.server.lifespan import configure_app


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Run each test in an empty cwd so ``./config.yaml`` is absent.

    ``ConfigBuilder.resolve_config()`` walks the cwd looking for a
    default ``config.yaml`` — if the test's working directory happens
    to contain one, the unconfigured-boot path won't be taken. Force a
    clean slate per test.
    """
    monkeypatch.chdir(tmp_path)


@pytest.mark.unit
class TestUnconfiguredBoot:
    """Booting with no config: routes register, /agent/* returns 503."""

    def test_create_app_with_no_config_returns_app_with_routes(self) -> None:
        """``create_app()`` with zero config sources returns an app whose
        OpenAPI surface includes the agent + base routes — agent endpoints
        gate on a 503 dependency, but the routes themselves exist."""
        app = create_app()
        # Lifespan does not run until the first request through TestClient,
        # so check the route table directly here.
        paths = {r.path for r in app.routes if hasattr(r, "path")}
        assert "/agent/run" in paths
        assert "/agent/sessions" in paths
        assert "/agent/config" in paths
        assert "/health" in paths
        assert "/reload" in paths

    def test_unconfigured_app_returns_200_on_health(self) -> None:
        """``/health`` works regardless of agent configuration — it is
        the load-balancer's reachability signal."""
        app = create_app()
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            body = response.json()
            assert body["status"] == "ok"
            assert body["agent_name"] is None  # No agent yet

    def test_unconfigured_app_returns_503_on_agent_run(self) -> None:
        """POST ``/agent/run`` on an unconfigured app surfaces the
        ``agent_not_ready`` 503. This is the contract embedders rely
        on while their wizards/onboarding flows are still in progress."""
        app = create_app()
        with TestClient(app) as client:
            response = client.post(
                "/agent/run",
                json={
                    "threadId": "t1",
                    "runId": "r1",
                    "messages": [
                        {"id": "m1", "role": "user", "content": "hello"}
                    ],
                    "state": {},
                    "tools": [],
                    "context": [],
                    "forwardedProps": {},
                },
            )
            assert response.status_code == 503, response.text
            detail = response.json().get("detail")
            assert isinstance(detail, dict)
            assert detail["error"]["code"] == "agent_not_ready"

    def test_unconfigured_app_returns_503_on_agent_config(self) -> None:
        """``GET /agent/config`` is also gated. It reads
        ``app.state.engine_config`` directly (no ``get_agent`` dep) so it
        needs its own guard — which it has after this fix."""
        app = create_app()
        with TestClient(app) as client:
            response = client.get("/agent/config")
            assert response.status_code == 503, response.text
            detail = response.json().get("detail")
            assert isinstance(detail, dict)
            assert detail["error"]["code"] == "agent_not_ready"

    def test_unconfigured_app_lifespan_sets_agent_to_none(self) -> None:
        """The unconfigured-boot lifespan must explicitly set
        ``app.state.agent = None`` so ``hasattr(state, 'agent')`` returns
        True with a falsy value. That distinction is what lets
        ``get_agent`` raise 503 instead of falling through to the
        legacy "no lifespan ran" config-loading fallback."""
        app = create_app()
        with TestClient(app):
            # Triggering the context starts the lifespan.
            assert hasattr(app.state, "agent")
            assert app.state.agent is None
            assert app.state.engine_config is None


@pytest.mark.unit
class TestConfigureAppBringsAgentOnline:
    """After ``configure_app`` runs, the previously-503 routes serve
    the configured agent. This is the path the standalone's reload
    pipeline exercises after the wizard materializes."""

    @pytest.mark.asyncio
    async def test_unconfigured_app_then_configure_sets_agent(self) -> None:
        """Boot unconfigured, then call ``configure_app`` directly with
        a real config. ``app.state.agent`` becomes a real agent and
        downstream consumers can use it.

        This test does not exercise ``/agent/run`` end-to-end (that
        requires the agent's framework runtime, which is covered by the
        adapter-specific integration suites). It pins the critical
        state transition from None → real agent that is the contract
        embedders depend on after wizard materialize."""
        from idun_agent_engine.core.config_builder import ConfigBuilder

        app = create_app()
        with TestClient(app):
            assert app.state.agent is None
            assert app.state.engine_config is None

            # Use the engine's own LangGraph echo fixture from the test
            # tree. Its module path is importable as a Python module so
            # we don't need to chdir or write a temp file.
            config = ConfigBuilder.resolve_config(
                config_dict={
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "Echo Test",
                            "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                        },
                    },
                }
            )
            assert isinstance(config, EngineConfig)

            await configure_app(app, config)

            assert app.state.agent is not None
            assert app.state.engine_config is not None
            assert app.state.engine_config.agent.config.name == "Echo Test"
