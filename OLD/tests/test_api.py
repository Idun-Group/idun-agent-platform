from fastapi.testclient import TestClient
from idun_agent_manager.main import app  # Assuming your FastAPI app instance is here
from idun_agent_manager.models.agent_models import FrameworkType, ToolType

client = TestClient(app)


def test_create_and_get_agent():
    """Test creating an agent and then retrieving it."""
    # Clear the in-memory DB for a clean test if necessary (or ensure tests are independent)
    # This might require a helper in in_memory_db.py to clear _agents_db for testing purposes.
    # For now, we assume it's either fresh or IDs are unique enough.

    sample_tool = {
        "name": "test_search_tool",
        "description": "A test tool.",
        "schema": {"type": "object", "properties": {"query": {"type": "string"}}},
        "type": ToolType.API.value,
    }

    agent_data = {
        "name": "Test Agent API",
        "description": "An agent created via API test.",
        "framework_type": FrameworkType.LANGGRAPH.value,
        "config": {"some_key": "some_value"},
        "llm_config": {"model": "test_model"},
        "tools": [sample_tool],
    }

    # 1. Create Agent
    response_create = client.post("/api/v1/agents/", json=agent_data)
    assert response_create.status_code == 201, response_create.text
    created_agent_data = response_create.json()
    assert created_agent_data["name"] == agent_data["name"]
    assert "id" in created_agent_data
    agent_id = created_agent_data["id"]

    # 2. Get Agent
    response_get = client.get(f"/api/v1/agents/{agent_id}")
    assert response_get.status_code == 200, response_get.text
    retrieved_agent_data = response_get.json()
    assert retrieved_agent_data["id"] == agent_id
    assert retrieved_agent_data["name"] == agent_data["name"]
    assert retrieved_agent_data["framework_type"] == FrameworkType.LANGGRAPH.value
    assert len(retrieved_agent_data["tools"]) == 1
    assert retrieved_agent_data["tools"][0]["name"] == "test_search_tool"


def test_list_agents():
    """Test listing agents."""
    # This test assumes there's at least one agent from the previous test or a fresh DB state.
    # For more robust testing, set up known states.
    response = client.get("/api/v1/agents/")
    assert response.status_code == 200
    agents_list = response.json()
    assert isinstance(agents_list, list)
    # If we know an agent was created in test_create_and_get_agent, we could check for its presence
    # This requires tests to run in order or to have a shared fixture/setup.


def test_get_nonexistent_agent():
    """Test retrieving a non-existent agent."""
    response = client.get("/api/v1/agents/nonexistent-agent-id-123")
    assert response.status_code == 404


# To run tests (from the project root directory):
# poetry run pytest
