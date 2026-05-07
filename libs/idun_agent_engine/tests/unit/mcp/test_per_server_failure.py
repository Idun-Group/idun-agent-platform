"""Per-server failure isolation in :class:`MCPClientRegistry` (D6).

Spec: when one MCP server fails to convert to a connection dict, the
remaining servers must still load and the registry must record the
failure so embedders (e.g. the standalone admin UI) can render a
``status: "failed"`` badge instead of guessing from logs.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from idun_agent_schema.engine.mcp_server import MCPServer

from idun_agent_engine.mcp.registry import MCPClientRegistry


@pytest.mark.unit
class TestPerServerFailureIsolation:
    def test_one_bad_server_does_not_break_the_others(self):
        """Bad ``as_connection_dict`` on server A still leaves server B live.

        Without per-server isolation the original try/except wrapped the
        whole construction and the broken server would silently kill the
        connection map for everyone.
        """
        good = MCPServer(
            name="good", transport="stdio", command="echo", args=["hi"]
        )
        bad = MCPServer(
            name="bad", transport="stdio", command="bad-cmd", args=["x"]
        )

        original = MCPServer.as_connection_dict

        def _maybe_fail(self):  # noqa: ANN001 — patched method
            if self.name == "bad":
                raise RuntimeError("boom: cannot resolve binary")
            return original(self)

        with patch.object(MCPServer, "as_connection_dict", _maybe_fail):
            registry = MCPClientRegistry(configs=[good, bad])

        assert registry.enabled, "registry should still be enabled with surviving server"
        assert registry.available_servers() == ["good"]

        failures = registry.failed
        assert len(failures) == 1
        assert failures[0]["name"] == "bad"
        assert failures[0]["kind"] == "stdio"
        assert "boom" in failures[0]["reason"]

    def test_failed_is_a_snapshot_not_a_live_view(self):
        """``failed`` must return a fresh list each call — internal state is immutable to callers."""
        bad = MCPServer(
            name="bad", transport="stdio", command="bad-cmd", args=["x"]
        )
        with patch.object(
            MCPServer,
            "as_connection_dict",
            side_effect=RuntimeError("nope"),
        ):
            registry = MCPClientRegistry(configs=[bad])

        snapshot = registry.failed
        snapshot.append({"name": "phantom", "kind": "stdio", "reason": "x"})
        assert len(registry.failed) == 1
        assert registry.failed[0]["name"] == "bad"

    def test_no_failures_when_every_server_initialises(self):
        good_a = MCPServer(
            name="a", transport="stdio", command="echo", args=["a"]
        )
        good_b = MCPServer(
            name="b", transport="stdio", command="echo", args=["b"]
        )

        registry = MCPClientRegistry(configs=[good_a, good_b])

        assert registry.enabled
        assert registry.failed == []
        assert sorted(registry.available_servers()) == ["a", "b"]

    def test_empty_configs_have_empty_failed(self):
        registry = MCPClientRegistry()
        assert registry.failed == []
        assert not registry.enabled

    def test_client_construction_failure_marks_remaining_servers(self):
        """If MultiServerMCPClient itself raises, every still-pending server is failed.

        Otherwise the UI would show those servers as ``running`` even
        though they aren't reachable through the registry.
        """
        good = MCPServer(
            name="good", transport="stdio", command="echo", args=["hi"]
        )

        with patch(
            "idun_agent_engine.mcp.registry.MultiServerMCPClient",
            side_effect=RuntimeError("client wedge"),
        ):
            registry = MCPClientRegistry(configs=[good])

        assert not registry.enabled
        failures = registry.failed
        assert len(failures) == 1
        assert failures[0]["name"] == "good"
        assert "client wedge" in failures[0]["reason"]


@pytest.mark.unit
class TestLifespanSurfacesFailures:
    """``configure_app`` must publish ``mcp_registry.failed`` on app.state."""

    @pytest.mark.asyncio
    async def test_failed_mcp_servers_lands_on_app_state(self):
        from unittest.mock import AsyncMock, MagicMock

        from idun_agent_engine.server.lifespan import configure_app

        bad = MCPServer(
            name="bad", transport="stdio", command="bad-cmd", args=["x"]
        )

        mock_app = MagicMock()
        mock_app.state = MagicMock()

        mock_engine_config = MagicMock()
        mock_engine_config.mcp_servers = [bad]
        mock_engine_config.guardrails = None
        mock_engine_config.sso = None
        mock_engine_config.integrations = None
        mock_engine_config.agent.type = "LANGGRAPH"
        mock_engine_config.agent.config = MagicMock()

        original = MCPServer.as_connection_dict

        def _maybe_fail(self):  # noqa: ANN001 — patched method
            if self.name == "bad":
                raise RuntimeError("nope")
            return original(self)

        with patch.object(MCPServer, "as_connection_dict", _maybe_fail), patch(
            "idun_agent_engine.server.lifespan.ConfigBuilder.initialize_agent_from_config",
            new_callable=AsyncMock,
        ) as mock_init:
            mock_agent = MagicMock()
            mock_agent.discover_capabilities = MagicMock(return_value=MagicMock())
            mock_agent.copilotkit_agent_instance = MagicMock()
            mock_init.return_value = mock_agent

            await configure_app(mock_app, mock_engine_config)

        failures = mock_app.state.failed_mcp_servers
        assert len(failures) == 1
        assert failures[0]["name"] == "bad"
        assert failures[0]["kind"] == "stdio"
