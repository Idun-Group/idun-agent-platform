"""Comprehensive tests for agent endpoints."""

import pytest
from uuid import uuid4


class TestAgentEndpoints:
    """Test class for all agent endpoints."""

    def test_create_agent_success(self, client, sample_agent_data):
        """Test successful agent creation."""
        response = client.post("/api/v1/agents/", json=sample_agent_data)
        
        assert response.status_code == 201
        data = response.json()
        
        # Check response structure
        assert "id" in data
        assert data["name"] == sample_agent_data["name"]
        assert data["description"] == sample_agent_data["description"]
        assert data["framework"] == sample_agent_data["framework"]
        assert data["status"] == "draft"
        assert "created_at" in data
        assert "updated_at" in data
        
        # Validate UUID format
        assert len(data["id"]) == 36  # UUID4 length

    def test_create_agent_with_minimal_data(self, client):
        """Test agent creation with minimal required data."""
        minimal_data = {"name": "Minimal Agent"}
        response = client.post("/api/v1/agents/", json=minimal_data)
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["name"] == "Minimal Agent"
        assert data["description"] is None
        assert data["framework"] == "langgraph"  # Default framework

    def test_create_agent_validation_errors(self, client):
        """Test validation errors during agent creation."""
        # Test empty name
        response = client.post("/api/v1/agents/", json={"name": ""})
        assert response.status_code == 422
        
        # Test whitespace-only name
        response = client.post("/api/v1/agents/", json={"name": "   "})
        assert response.status_code == 422
        
        # Test name too long
        long_name = "A" * 101
        response = client.post("/api/v1/agents/", json={"name": long_name})
        assert response.status_code == 422
        
        # Test description too long
        long_description = "A" * 501
        response = client.post("/api/v1/agents/", json={
            "name": "Valid Name",
            "description": long_description
        })
        assert response.status_code == 422
        
        # Test invalid framework
        response = client.post("/api/v1/agents/", json={
            "name": "Valid Name",
            "framework": "invalid_framework"
        })
        assert response.status_code == 422

    def test_create_agent_missing_name(self, client):
        """Test agent creation without required name field."""
        response = client.post("/api/v1/agents/", json={"description": "No name provided"})
        assert response.status_code == 422

    def test_list_agents_empty(self, client):
        """Test listing agents when database is empty."""
        response = client.get("/api/v1/agents/")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_agents_with_data(self, client, sample_agent_data):
        """Test listing agents when data exists."""
        # Create a few agents first
        agent1_response = client.post("/api/v1/agents/", json=sample_agent_data)
        agent2_data = {**sample_agent_data, "name": "Second Agent"}
        agent2_response = client.post("/api/v1/agents/", json=agent2_data)
        
        assert agent1_response.status_code == 201
        assert agent2_response.status_code == 201
        
        # List agents
        response = client.get("/api/v1/agents/")
        assert response.status_code == 200
        
        agents = response.json()
        assert len(agents) >= 2  # At least the two we created
        
        # Check that our agents are in the list
        agent_names = [agent["name"] for agent in agents]
        assert "Test Agent" in agent_names
        assert "Second Agent" in agent_names

    def test_get_agent_success(self, client, sample_agent_data):
        """Test successfully getting a specific agent."""
        # Create an agent first
        create_response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert create_response.status_code == 201
        created_agent = create_response.json()
        agent_id = created_agent["id"]
        
        # Get the agent
        response = client.get(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 200
        
        agent = response.json()
        assert agent["id"] == agent_id
        assert agent["name"] == sample_agent_data["name"]
        assert agent["description"] == sample_agent_data["description"]
        assert agent["framework"] == sample_agent_data["framework"]

    def test_get_agent_not_found(self, client):
        """Test getting a non-existent agent."""
        fake_id = str(uuid4())
        response = client.get(f"/api/v1/agents/{fake_id}")
        
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()
        assert fake_id in error["detail"]

    def test_update_agent_success(self, client, sample_agent_data):
        """Test successfully updating an agent."""
        # Create an agent first
        create_response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert create_response.status_code == 201
        created_agent = create_response.json()
        agent_id = created_agent["id"]
        original_created_at = created_agent["created_at"]
        
        # Update the agent
        update_data = {
            "name": "Updated Agent Name",
            "description": "Updated description",
            "framework": "langchain"
        }
        response = client.put(f"/api/v1/agents/{agent_id}", json=update_data)
        assert response.status_code == 200
        
        updated_agent = response.json()
        assert updated_agent["id"] == agent_id
        assert updated_agent["name"] == update_data["name"]
        assert updated_agent["description"] == update_data["description"]
        assert updated_agent["framework"] == update_data["framework"]
        assert updated_agent["created_at"] == original_created_at  # Should not change
        assert updated_agent["updated_at"] != original_created_at  # Should be updated

    def test_update_agent_partial(self, client, sample_agent_data):
        """Test partially updating an agent."""
        # Create an agent first
        create_response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert create_response.status_code == 201
        created_agent = create_response.json()
        agent_id = created_agent["id"]
        
        # Update only the name
        update_data = {"name": "Only Name Updated"}
        response = client.put(f"/api/v1/agents/{agent_id}", json=update_data)
        assert response.status_code == 200
        
        updated_agent = response.json()
        assert updated_agent["name"] == "Only Name Updated"
        # Other fields should remain unchanged
        assert updated_agent["description"] == sample_agent_data["description"]
        assert updated_agent["framework"] == sample_agent_data["framework"]

    def test_update_agent_validation_errors(self, client, sample_agent_data):
        """Test validation errors during agent update."""
        # Create an agent first
        create_response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert create_response.status_code == 201
        agent_id = create_response.json()["id"]
        
        # Test empty name
        response = client.put(f"/api/v1/agents/{agent_id}", json={"name": ""})
        assert response.status_code == 422
        
        # Test name too long
        long_name = "A" * 101
        response = client.put(f"/api/v1/agents/{agent_id}", json={"name": long_name})
        assert response.status_code == 422
        
        # Test invalid framework
        response = client.put(f"/api/v1/agents/{agent_id}", json={"framework": "invalid"})
        assert response.status_code == 422

    def test_update_agent_not_found(self, client):
        """Test updating a non-existent agent."""
        fake_id = str(uuid4())
        update_data = {"name": "Updated Name"}
        response = client.put(f"/api/v1/agents/{fake_id}", json=update_data)
        
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    def test_delete_agent_success(self, client, sample_agent_data):
        """Test successfully deleting an agent."""
        # Create an agent first
        create_response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert create_response.status_code == 201
        agent_id = create_response.json()["id"]
        
        # Delete the agent
        response = client.delete(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 204
        assert response.content == b""  # No content for 204
        
        # Verify the agent is gone
        get_response = client.get(f"/api/v1/agents/{agent_id}")
        assert get_response.status_code == 404

    def test_delete_agent_not_found(self, client):
        """Test deleting a non-existent agent."""
        fake_id = str(uuid4())
        response = client.delete(f"/api/v1/agents/{fake_id}")
        
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    def test_agent_workflow_integration(self, client):
        """Test a complete workflow: create -> read -> update -> delete."""
        # 1. Create agent
        agent_data = {
            "name": "Workflow Test Agent",
            "description": "Testing complete workflow",
            "framework": "crewai"
        }
        create_response = client.post("/api/v1/agents/", json=agent_data)
        assert create_response.status_code == 201
        agent = create_response.json()
        agent_id = agent["id"]
        
        # 2. Read agent
        get_response = client.get(f"/api/v1/agents/{agent_id}")
        assert get_response.status_code == 200
        assert get_response.json()["name"] == agent_data["name"]
        
        # 3. Update agent
        update_data = {"name": "Updated Workflow Agent"}
        update_response = client.put(f"/api/v1/agents/{agent_id}", json=update_data)
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "Updated Workflow Agent"
        
        # 4. Verify update in list
        list_response = client.get("/api/v1/agents/")
        assert list_response.status_code == 200
        agents = list_response.json()
        updated_agent = next((a for a in agents if a["id"] == agent_id), None)
        assert updated_agent is not None
        assert updated_agent["name"] == "Updated Workflow Agent"
        
        # 5. Delete agent
        delete_response = client.delete(f"/api/v1/agents/{agent_id}")
        assert delete_response.status_code == 204
        
        # 6. Verify deletion
        final_get_response = client.get(f"/api/v1/agents/{agent_id}")
        assert final_get_response.status_code == 404

    def test_framework_enum_values(self, client):
        """Test all supported framework values."""
        supported_frameworks = ["langgraph", "langchain", "autogen", "crewai", "custom"]
        
        for framework in supported_frameworks:
            agent_data = {
                "name": f"Agent with {framework}",
                "framework": framework
            }
            response = client.post("/api/v1/agents/", json=agent_data)
            assert response.status_code == 201
            assert response.json()["framework"] == framework

    def test_agent_status_default(self, client, sample_agent_data):
        """Test that new agents have 'draft' status by default."""
        response = client.post("/api/v1/agents/", json=sample_agent_data)
        assert response.status_code == 201
        agent = response.json()
        assert agent["status"] == "draft"
