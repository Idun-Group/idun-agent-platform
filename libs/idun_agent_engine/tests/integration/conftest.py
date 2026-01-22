"""Integration test fixtures for idun_agent_engine.

These fixtures provide real (non-mocked) components for integration testing.
They may require external services or create actual resources.
"""

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig


# -----------------------------------------------------------------------------
# Real App Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def integration_config(tmp_path) -> dict[str, Any]:
    """Provide a configuration for integration testing.

    Uses a real graph definition from the fixtures directory.
    """
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Integration Test Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
            },
        },
    }


@pytest.fixture
def integration_config_with_sqlite(tmp_path) -> dict[str, Any]:
    """Provide a configuration with SQLite checkpointer for persistence testing."""
    db_path = tmp_path / "test_checkpoints.db"
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Persistent Integration Agent",
                "graph_definition": "tests.fixtures.agents.mock_graph:graph",
                "checkpointer": {
                    "type": "sqlite",
                    "db_url": f"sqlite:///{db_path}",
                },
            },
        },
    }


@pytest.fixture
def real_app(integration_config: dict[str, Any]) -> FastAPI:
    """Create a real FastAPI app for integration testing.

    Unlike unit test fixtures, this creates a fully configured app
    that could potentially invoke real agent logic.
    """
    return create_app(config_dict=integration_config)


@pytest.fixture
def real_engine_config(integration_config: dict[str, Any]) -> EngineConfig:
    """Create a validated EngineConfig for integration testing."""
    return EngineConfig.model_validate(integration_config)


# -----------------------------------------------------------------------------
# Async HTTP Client Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
async def async_client(real_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP client for testing the app.

    This allows testing async endpoints properly with real async I/O.

    Example:
        async def test_something(async_client):
            response = await async_client.get("/health")
            assert response.status_code == 200
    """
    async with AsyncClient(
        transport=ASGITransport(app=real_app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture
def sync_test_client(real_app: FastAPI):
    """Provide a sync TestClient for simpler integration tests.

    Use this when you don't need true async behavior.
    """
    from fastapi.testclient import TestClient

    return TestClient(real_app)


# -----------------------------------------------------------------------------
# Database Fixtures (for checkpointer testing)
# -----------------------------------------------------------------------------


@pytest.fixture
def sqlite_db_path(tmp_path):
    """Provide a temporary SQLite database path."""
    return tmp_path / "test_integration.db"


@pytest.fixture
async def clean_sqlite_checkpointer(sqlite_db_path):
    """Provide a clean SQLite checkpointer for each test.

    The database is created fresh for each test and cleaned up after.
    """
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    async with AsyncSqliteSaver.from_conn_string(str(sqlite_db_path)) as saver:
        yield saver


# -----------------------------------------------------------------------------
# Skip Markers
# -----------------------------------------------------------------------------


def pytest_configure(config):
    """Register custom markers for integration tests."""
    config.addinivalue_line(
        "markers",
        "requires_langfuse: mark test as requiring Langfuse service",
    )
    config.addinivalue_line(
        "markers",
        "requires_phoenix: mark test as requiring Phoenix service",
    )
    config.addinivalue_line(
        "markers",
        "requires_postgres: mark test as requiring PostgreSQL",
    )
