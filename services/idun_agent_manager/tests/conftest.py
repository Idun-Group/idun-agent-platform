"""Test configuration and fixtures."""

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routers.agents import agents_db
from app.main import app


@pytest.fixture(autouse=True)
def clear_agents_db():
    """Clear the agents database before each test."""
    agents_db.clear()
    yield
    agents_db.clear()


@pytest.fixture
def client():
    """Create a test client with clean database."""
    return TestClient(app)


@pytest.fixture
def sample_agent_data():
    """Sample valid agent data for testing."""
    return {
        "name": "Test Agent",
        "description": "A test agent for validation",
        "framework": "langgraph",
    }


@pytest.fixture
def multiple_agents_data():
    """Multiple agents data for bulk testing."""
    return [
        {
            "name": "Agent 1",
            "description": "First test agent",
            "framework": "langgraph",
        },
        {
            "name": "Agent 2",
            "description": "Second test agent",
            "framework": "langchain",
        },
        {"name": "Agent 3", "description": "Third test agent", "framework": "crewai"},
    ]
