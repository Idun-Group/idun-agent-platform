"""Shared pytest fixtures for idun_agent_engine tests.

This module provides reusable fixtures for testing the idun_agent_engine library.
Fixtures are designed to be composable and easy to customize for specific test needs.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable, Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig

# -----------------------------------------------------------------------------
# Configuration Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def sample_langgraph_config() -> dict[str, Any]:
    """Provide a minimal LangGraph agent configuration dictionary.

    Returns:
        A dictionary with the minimum required configuration for a LangGraph agent.
    """
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": "./test_agent.py:graph",
            },
        },
    }


@pytest.fixture
def sample_config_with_observability() -> dict[str, Any]:
    """Provide a configuration dictionary with observability settings.

    Returns:
        A dictionary with LangGraph config and disabled observability.
    """
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent with Observability",
                "graph_definition": "./test_agent.py:graph",
                "observability": {
                    "provider": "langfuse",
                    "enabled": False,
                    "options": {},
                },
            },
        },
    }


@pytest.fixture
def sample_config_with_checkpointer(tmp_path) -> dict[str, Any]:
    """Provide a configuration dictionary with SQLite checkpointer.

    Args:
        tmp_path: Pytest's temporary path fixture.

    Returns:
        A dictionary with LangGraph config and SQLite checkpointer.
    """
    return {
        "server": {"api": {"port": 8000}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent with Checkpointer",
                "graph_definition": "./test_agent.py:graph",
                "checkpointer": {
                    "type": "sqlite",
                    "db_url": f"sqlite:///{tmp_path}/test_checkpoint.db",
                },
            },
        },
    }


@pytest.fixture
def engine_config_factory() -> Callable[..., EngineConfig]:
    """Factory fixture to create EngineConfig instances with custom values.

    Returns:
        A callable that creates EngineConfig instances.

    Example:
        def test_something(engine_config_factory):
            config = engine_config_factory(port=9000, name="Custom Agent")
            assert config.server.api.port == 9000
    """

    def _factory(
        port: int = 8000,
        name: str = "Test Agent",
        graph_definition: str = "./test_agent.py:graph",
        agent_type: str = "LANGGRAPH",
        **extra_agent_config: Any,
    ) -> EngineConfig:
        from idun_agent_engine.core.engine_config import EngineConfig

        config_dict = {
            "server": {"api": {"port": port}},
            "agent": {
                "type": agent_type,
                "config": {
                    "name": name,
                    "graph_definition": graph_definition,
                    **extra_agent_config,
                },
            },
        }
        return EngineConfig.model_validate(config_dict)

    return _factory


# -----------------------------------------------------------------------------
# Mock Agent Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def mock_agent() -> MagicMock:
    """Provide a pre-configured mock agent with common methods stubbed.

    Returns:
        A MagicMock configured to behave like a BaseAgent.
    """
    agent = MagicMock()
    agent.id = "test-agent-id"
    agent.agent_type = "LANGGRAPH"
    agent.name = "Mock Test Agent"
    agent.infos = {"version": "1.0.0", "status": "ready"}
    agent.configuration = MagicMock()
    return agent


@pytest.fixture
def async_mock_agent() -> AsyncMock:
    """Provide a pre-configured async mock agent for async tests.

    Returns:
        An AsyncMock configured with async invoke and stream methods.
    """
    agent = AsyncMock()
    agent.id = "test-agent-id"
    agent.agent_type = "LANGGRAPH"
    agent.name = "Async Mock Test Agent"
    agent.infos = {"version": "1.0.0", "status": "ready"}
    agent.configuration = MagicMock()

    # Configure invoke to return a default response
    agent.invoke.return_value = "Mock response"

    # Configure close method
    agent.close = AsyncMock()

    return agent


@pytest.fixture
def streaming_mock_agent() -> AsyncMock:
    """Provide a mock agent configured for streaming responses.

    Returns:
        An AsyncMock with a stream method that yields test events.
    """
    agent = AsyncMock()
    agent.id = "test-agent-id"
    agent.agent_type = "LANGGRAPH"
    agent.name = "Streaming Mock Agent"

    async def mock_stream(message: Any) -> AsyncGenerator[Any, None]:
        """Generate mock streaming events."""

        class MockEvent:
            def __init__(self, data: str):
                self.data = data

            def model_dump_json(self) -> str:
                import json

                return json.dumps({"event": "chunk", "data": self.data})

        for i in range(3):
            yield MockEvent(f"chunk-{i}")

    agent.stream = mock_stream
    agent.close = AsyncMock()

    return agent


# -----------------------------------------------------------------------------
# FastAPI App Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def app_factory(
    sample_langgraph_config: dict[str, Any],
) -> Callable[..., FastAPI]:
    """Factory fixture to create FastAPI test applications.

    Args:
        sample_langgraph_config: Default configuration to use.

    Returns:
        A callable that creates FastAPI applications with custom configs.

    Example:
        def test_something(app_factory):
            app = app_factory(port=9000)
            # Use the app...
    """

    def _factory(
        config_dict: dict[str, Any] | None = None,
        **config_overrides: Any,
    ) -> FastAPI:
        from idun_agent_engine.core.app_factory import create_app

        if config_dict is None:
            config_dict = sample_langgraph_config.copy()

        # Apply overrides
        if "port" in config_overrides:
            config_dict["server"]["api"]["port"] = config_overrides["port"]
        if "name" in config_overrides:
            config_dict["agent"]["config"]["name"] = config_overrides["name"]

        return create_app(config_dict=config_dict)

    return _factory


@pytest.fixture
def test_app(sample_langgraph_config: dict[str, Any]) -> FastAPI:
    """Provide a basic FastAPI test application.

    Args:
        sample_langgraph_config: The default test configuration.

    Returns:
        A configured FastAPI application.
    """
    from idun_agent_engine.core.app_factory import create_app

    return create_app(config_dict=sample_langgraph_config)


@pytest.fixture
def test_client(test_app: FastAPI) -> Generator[TestClient, None, None]:
    """Provide a TestClient for the test application.

    Args:
        test_app: The FastAPI application to test.

    Yields:
        A TestClient instance.
    """
    with TestClient(test_app) as client:
        yield client


@pytest.fixture
def test_client_factory(
    app_factory: Callable[..., FastAPI],
) -> Callable[..., TestClient]:
    """Factory fixture to create TestClient instances with custom configs.

    Args:
        app_factory: The app factory fixture.

    Returns:
        A callable that creates TestClient instances.

    Example:
        def test_something(test_client_factory):
            client = test_client_factory(port=9000)
            response = client.get("/health")
    """

    def _factory(**kwargs: Any) -> TestClient:
        app = app_factory(**kwargs)
        return TestClient(app)

    return _factory


# -----------------------------------------------------------------------------
# Utility Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def mock_fastapi_state() -> MagicMock:
    """Provide a mock FastAPI app state object.

    Returns:
        A MagicMock that can be used as app.state.
    """
    state = MagicMock()
    state.agent = None
    state.config = None
    state.engine_config = None
    return state


@pytest.fixture
def mock_app(mock_fastapi_state: MagicMock) -> MagicMock:
    """Provide a mock FastAPI app with state configured.

    Args:
        mock_fastapi_state: The mock state object.

    Returns:
        A MagicMock that behaves like a FastAPI app.
    """
    app = MagicMock()
    app.state = mock_fastapi_state
    return app
