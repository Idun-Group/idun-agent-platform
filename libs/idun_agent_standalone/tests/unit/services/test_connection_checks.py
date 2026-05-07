"""Unit tests for ``services/connection_checks.py``.

These tests focus on the pure shape-handling branches of each probe:
trivial OK paths, malformed configs, the GCP "config-valid + note" path
that intentionally skips the wire, and the timeout / exception fallback.

Real network probes (Langfuse HTTP HEAD, MCP stdio launch) are not
exercised here — the integration tests that drive the routers cover
the request path; the network behaviour itself is an external concern.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest
from idun_agent_standalone.services import connection_checks

# ---- memory ---------------------------------------------------------------


async def test_memory_langgraph_in_memory_ok() -> None:
    result = await connection_checks.check_memory("LANGGRAPH", {"type": "memory"})
    assert result.ok is True
    assert result.details == {"backend": "in-memory"}


async def test_memory_adk_in_memory_ok() -> None:
    result = await connection_checks.check_memory("ADK", {"type": "in_memory"})
    assert result.ok is True
    assert result.details == {"backend": "in-memory"}


async def test_memory_missing_type_fails() -> None:
    result = await connection_checks.check_memory("LANGGRAPH", {})
    assert result.ok is False
    assert "missing 'type'" in result.error  # type: ignore[operator]


async def test_memory_unsupported_framework_fails() -> None:
    result = await connection_checks.check_memory("HAYSTACK", {"type": "memory"})
    assert result.ok is False
    assert "unsupported agent framework" in result.error  # type: ignore[operator]


async def test_memory_unsupported_langgraph_type_fails() -> None:
    result = await connection_checks.check_memory(
        "LANGGRAPH", {"type": "redis", "db_url": "redis://x"}
    )
    assert result.ok is False
    assert "unsupported LangGraph memory type" in result.error  # type: ignore[operator]


async def test_memory_sqlite_missing_url_fails() -> None:
    result = await connection_checks.check_memory("LANGGRAPH", {"type": "sqlite"})
    assert result.ok is False
    assert "requires 'db_url'" in result.error  # type: ignore[operator]


async def test_memory_sqlite_in_memory_url_passes() -> None:
    """A throwaway in-memory SQLite URL exercises the real ``SELECT 1`` path."""
    result = await connection_checks.check_memory(
        "LANGGRAPH",
        {"type": "sqlite", "db_url": "sqlite:///:memory:"},
    )
    assert result.ok is True, f"unexpected failure: {result.error}"
    assert result.details == {"backend": "sqlite"}


async def test_memory_adk_vertex_missing_fields_fails() -> None:
    result = await connection_checks.check_memory(
        "ADK", {"type": "vertex_ai", "project_id": "p"}
    )
    assert result.ok is False
    assert "project_id" in result.error or "location" in result.error  # type: ignore[operator]


async def test_memory_adk_vertex_complete_returns_note() -> None:
    """Vertex AI is config-valid but does not hit the wire."""
    result = await connection_checks.check_memory(
        "ADK",
        {"type": "vertex_ai", "project_id": "p", "location": "us"},
    )
    assert result.ok is True
    assert result.details is not None
    assert "GCP credentials" in result.details["note"]


async def test_memory_timeout_returns_structured_failure() -> None:
    """If the probe overruns the timeout, return ``ok=False`` not raise."""

    async def _slow(*_a, **_kw):
        await asyncio.sleep(10)
        raise AssertionError("unreachable")

    with (
        patch.object(connection_checks, "_check_memory_impl", _slow),
        patch.object(connection_checks, "_DEFAULT_TIMEOUT_S", 0.05),
    ):
        result = await connection_checks.check_memory("LANGGRAPH", {"type": "memory"})
    assert result.ok is False
    assert "timed out" in result.error  # type: ignore[operator]


# ---- observability --------------------------------------------------------


async def test_observability_missing_provider_fails() -> None:
    result = await connection_checks.check_observability({"config": {}})
    assert result.ok is False
    assert "missing 'provider'" in result.error  # type: ignore[operator]


async def test_observability_disabled_returns_note() -> None:
    """A disabled provider is not probed — config is taken at face value."""
    result = await connection_checks.check_observability(
        {"provider": "LANGFUSE", "enabled": False, "config": {"host": "https://x"}}
    )
    assert result.ok is True
    assert "disabled" in result.details["note"]  # type: ignore[index]


async def test_observability_gcp_trace_returns_note() -> None:
    result = await connection_checks.check_observability(
        {"provider": "GCP_TRACE", "config": {"project_id": "p"}}
    )
    assert result.ok is True
    assert "GCP credentials" in result.details["note"]  # type: ignore[index]


async def test_observability_gcp_logging_missing_project_fails() -> None:
    result = await connection_checks.check_observability(
        {"provider": "GCP_LOGGING", "config": {}}
    )
    assert result.ok is False
    assert "project_id" in result.error  # type: ignore[operator]


async def test_observability_unsupported_provider_fails() -> None:
    result = await connection_checks.check_observability(
        {"provider": "DATADOG", "config": {}}
    )
    assert result.ok is False
    assert "unsupported observability provider" in result.error  # type: ignore[operator]


# ---- mcp servers ----------------------------------------------------------


async def test_mcp_invalid_config_fails() -> None:
    """An MCP config that fails Pydantic validation returns ok=False."""
    result = await connection_checks.check_mcp_server({"name": "x"})
    # transport check + url/command check inside MCPServer.model_validator catch this
    assert result.ok is False
    assert "invalid MCP server config" in result.error  # type: ignore[operator]


async def test_mcp_timeout_returns_structured_failure() -> None:
    async def _slow(*_a, **_kw):
        await asyncio.sleep(10)
        raise AssertionError("unreachable")

    with (
        patch.object(connection_checks, "_check_mcp_server_impl", _slow),
        patch.object(connection_checks, "_DEFAULT_TIMEOUT_S", 0.05),
    ):
        result = await connection_checks.check_mcp_server(
            {"name": "x", "transport": "stdio", "command": "true"}
        )
    assert result.ok is False
    assert "timed out" in result.error  # type: ignore[operator]


# ---- url mapping helper ---------------------------------------------------


@pytest.mark.parametrize(
    "url,expected",
    [
        ("sqlite:///x.db", "sqlite+aiosqlite:///x.db"),
        ("sqlite+aiosqlite:///x.db", "sqlite+aiosqlite:///x.db"),
        ("postgresql://u@h/d", "postgresql+asyncpg://u@h/d"),
        ("postgres://u@h/d", "postgresql+asyncpg://u@h/d"),
        ("postgresql+asyncpg://u@h/d", "postgresql+asyncpg://u@h/d"),
        ("redis://h", None),
    ],
)
def test_to_async_url(url: str, expected: str | None) -> None:
    assert connection_checks._to_async_url(url) == expected
