from typing import List
from fastapi import APIRouter, HTTPException, status, Body
from idun_agent_manager.models.agent_models import Agent
from idun_agent_manager.db import in_memory_db

router = APIRouter(
    prefix="/api/v1/agents",
    tags=["Agents"],
)

@router.post("/", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(agent: Agent = Body(...)):
    """
    Create a new agent.
    - **agent**: Agent object to create.
    """
    try:
        return in_memory_db.create_agent_in_db(agent)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/", response_model=List[Agent])
def list_agents():
    """
    List all agents.
    """
    return in_memory_db.list_agents_from_db()

@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str):
    """
    Retrieve a specific agent by its ID.
    - **agent_id**: The ID of the agent to retrieve.
    """
    agent = in_memory_db.get_agent_from_db(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.put("/{agent_id}", response_model=Agent)
def update_agent(agent_id: str, agent_update: Agent = Body(...)):
    """
    Update an existing agent.
    - **agent_id**: The ID of the agent to update.
    - **agent_update**: Agent object with updated information.
    """
    # Ensure the ID in the body matches the path, or if not present in body, set it.
    # Pydantic models with default_factory for ID might create a new one if not supplied.
    # For PUT, we usually expect the client to know the ID.
    if agent_update.id != agent_id:
        # Option 1: Forbid changing ID via PUT - client should DELETE and POST
        # raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Agent ID in path ({agent_id}) does not match ID in body ({agent_update.id}).")
        # Option 2: Allow it, but be mindful. Let's assume for now the path ID is canonical for update target.
        # We will update the agent with agent_id, using data from agent_update.
        # The DB function handles potential ID change in the object itself.
        pass # The DB function will handle the update logic including potential ID change.

    updated_agent = in_memory_db.update_agent_in_db(agent_id, agent_update)
    if not updated_agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return updated_agent

@router.delete("/{agent_id}", response_model=Agent, status_code=status.HTTP_200_OK)
def delete_agent(agent_id: str):
    """
    Delete an agent by its ID.
    - **agent_id**: The ID of the agent to delete.
    """
    deleted_agent = in_memory_db.delete_agent_from_db(agent_id)
    if not deleted_agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return deleted_agent 