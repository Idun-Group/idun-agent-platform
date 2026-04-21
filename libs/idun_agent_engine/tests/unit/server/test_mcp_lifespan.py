"""Tests for MCP server lifespan integration in the engine."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.capabilities import (
    AgentCapabilities,
    CapabilityFlags,
    InputDescriptor,
    OutputDescriptor,
)

CHAT_CAPS = AgentCapabilities(
    framework=AgentFramework.LANGGRAPH,
    capabilities=CapabilityFlags(),
    input=InputDescriptor(mode="chat"),
    output=OutputDescriptor(mode="text"),
)


def _make_engine_config(as_mcp: bool = True):
    """Build a minimal EngineConfig-like mock."""
    config = MagicMock()
    config.server.as_mcp = as_mcp
    config.server.mcp_description = None
    config.guardrails = None
    config.mcp_servers = None
    config.sso = None
    config.integrations = None
    return config


def _mock_app(engine_config=None):
    """Build a minimal FastAPI-like mock app with state."""
    app = MagicMock()
    app.state = MagicMock()
    app.state.engine_config = engine_config or _make_engine_config()
    app.state.mcp_app = None
    app.state.capabilities = None
    app.router = MagicMock()
    app.router.routes = []
    return app


@pytest.mark.unit
class TestConfigureAppMCPMount:
    """Tests for MCP mounting in configure_app."""

    @pytest.mark.asyncio
    async def test_mcp_mounted_when_as_mcp_true_and_capabilities_available(self):
        from idun_agent_engine.server.lifespan import configure_app

        config = _make_engine_config(as_mcp=True)
        app = _mock_app(config)

        mock_agent = MagicMock()
        mock_agent.name = "Test"
        mock_agent.discover_capabilities = MagicMock(return_value=CHAT_CAPS)

        with patch(
            "idun_agent_engine.server.lifespan.ConfigBuilder"
        ) as mock_cb:
            mock_cb.initialize_agent_from_config = AsyncMock(return_value=mock_agent)
            await configure_app(app, config)

        assert app.state.mcp_app is not None
        assert len(app.router.routes) > 0

    @pytest.mark.asyncio
    async def test_mcp_not_mounted_when_as_mcp_false(self):
        from idun_agent_engine.server.lifespan import configure_app

        config = _make_engine_config(as_mcp=False)
        app = _mock_app(config)

        mock_agent = MagicMock()
        mock_agent.name = "Test"
        mock_agent.discover_capabilities = MagicMock(return_value=CHAT_CAPS)

        with patch(
            "idun_agent_engine.server.lifespan.ConfigBuilder"
        ) as mock_cb:
            mock_cb.initialize_agent_from_config = AsyncMock(return_value=mock_agent)
            await configure_app(app, config)

        assert app.state.mcp_app is None
        assert app.router.routes == []

    @pytest.mark.asyncio
    async def test_mcp_not_mounted_when_capabilities_unavailable(self):
        from idun_agent_engine.server.lifespan import configure_app

        config = _make_engine_config(as_mcp=True)
        app = _mock_app(config)

        mock_agent = MagicMock()
        mock_agent.name = "Test"
        # discover_capabilities raises
        mock_agent.discover_capabilities = MagicMock(side_effect=RuntimeError("nope"))

        with patch(
            "idun_agent_engine.server.lifespan.ConfigBuilder"
        ) as mock_cb:
            mock_cb.initialize_agent_from_config = AsyncMock(return_value=mock_agent)
            await configure_app(app, config)

        assert app.state.mcp_app is None
        assert app.router.routes == []

    @pytest.mark.asyncio
    async def test_mcp_mount_failure_is_non_fatal(self):
        from idun_agent_engine.server.lifespan import configure_app

        config = _make_engine_config(as_mcp=True)
        app = _mock_app(config)

        mock_agent = MagicMock()
        mock_agent.name = "Test"
        mock_agent.discover_capabilities = MagicMock(return_value=CHAT_CAPS)

        with (
            patch(
                "idun_agent_engine.server.lifespan.ConfigBuilder"
            ) as mock_cb,
            patch(
                "idun_agent_engine.server.mcp_endpoint.create_mcp_server",
                side_effect=ValueError("boom"),
            ),
        ):
            mock_cb.initialize_agent_from_config = AsyncMock(return_value=mock_agent)
            # Should not raise
            await configure_app(app, config)

        assert getattr(app.state, "agent", None) is not None


@pytest.mark.unit
class TestLifespanMCPSessionManager:
    """Tests for MCP session manager lifecycle within the engine lifespan."""

    @pytest.mark.asyncio
    async def test_session_manager_started_when_mcp_app_present(self):
        session_started = False
        session_stopped = False

        @asynccontextmanager
        async def mock_lifespan(app):
            nonlocal session_started, session_stopped
            session_started = True
            yield
            session_stopped = True

        app = MagicMock()
        app.state = MagicMock()
        app.state.engine_config = _make_engine_config()

        mcp_app = MagicMock()
        mcp_app.router.lifespan_context = mock_lifespan
        app.state.mcp_app = mcp_app

        from idun_agent_engine.server.lifespan import lifespan

        with patch(
            "idun_agent_engine.server.lifespan.configure_app", new=AsyncMock()
        ), patch(
            "idun_agent_engine.server.lifespan.get_telemetry",
            return_value=MagicMock(capture=MagicMock()),
        ):
            async with lifespan(app):
                assert session_started
                assert not session_stopped

        assert session_stopped

    @pytest.mark.asyncio
    async def test_lifespan_yields_when_no_mcp_app(self):
        app = MagicMock()
        app.state = MagicMock()
        app.state.engine_config = _make_engine_config()
        app.state.mcp_app = None

        from idun_agent_engine.server.lifespan import lifespan

        with patch(
            "idun_agent_engine.server.lifespan.configure_app", new=AsyncMock()
        ), patch(
            "idun_agent_engine.server.lifespan.get_telemetry",
            return_value=MagicMock(capture=MagicMock()),
        ):
            async with lifespan(app):
                pass  # should not hang or raise

    @pytest.mark.asyncio
    async def test_lifespan_yields_when_mcp_lifespan_creation_fails(self):
        app = MagicMock()
        app.state = MagicMock()
        app.state.engine_config = _make_engine_config()

        mcp_app = MagicMock()
        mcp_app.router.lifespan_context = MagicMock(side_effect=RuntimeError("broken"))
        app.state.mcp_app = mcp_app

        from idun_agent_engine.server.lifespan import lifespan

        with patch(
            "idun_agent_engine.server.lifespan.configure_app", new=AsyncMock()
        ), patch(
            "idun_agent_engine.server.lifespan.get_telemetry",
            return_value=MagicMock(capture=MagicMock()),
        ):
            async with lifespan(app):
                pass  # should not raise
