"""Tests for the active registry module-level getter/setter."""

import pytest
from idun_agent_schema.engine.mcp_server import MCPServer

from idun_agent_engine.mcp.registry import (
    MCPClientRegistry,
    get_active_registry,
    set_active_registry,
)


@pytest.fixture(autouse=True)
def _clear_active_registry():
    """Ensure each test starts and ends with a clean active registry."""
    set_active_registry(None)
    yield
    set_active_registry(None)


def _make_registry() -> MCPClientRegistry:
    return MCPClientRegistry(
        configs=[
            MCPServer(
                name="test-server",
                transport="stdio",
                command="echo",
                args=["hello"],
            )
        ]
    )


@pytest.mark.unit
class TestActiveRegistryLifecycle:
    def test_default_is_none(self):
        assert get_active_registry() is None

    def test_set_and_get_returns_same_instance(self):
        registry = _make_registry()
        set_active_registry(registry)
        assert get_active_registry() is registry

    def test_set_twice_replaces_first(self):
        first = _make_registry()
        second = _make_registry()
        set_active_registry(first)
        set_active_registry(second)
        assert get_active_registry() is second
        assert get_active_registry() is not first

    def test_set_none_clears(self):
        registry = _make_registry()
        set_active_registry(registry)
        assert get_active_registry() is not None
        set_active_registry(None)
        assert get_active_registry() is None
