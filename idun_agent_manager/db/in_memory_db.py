from typing import Dict, List, Optional
from idun_agent_manager.models.agent_models import Agent

# Simple in-memory storage for agents
_agents_db: Dict[str, Agent] = {}

def create_agent_in_db(agent: Agent) -> Agent:
    """Stores an agent in the in-memory DB."""
    if agent.id in _agents_db:
        raise ValueError(f"Agent with ID {agent.id} already exists.")
    _agents_db[agent.id] = agent
    return agent

def get_agent_from_db(agent_id: str) -> Optional[Agent]:
    """Retrieves an agent from the in-memory DB by ID."""
    return _agents_db.get(agent_id)

def list_agents_from_db() -> List[Agent]:
    """Lists all agents in the in-memory DB."""
    return list(_agents_db.values())

def update_agent_in_db(agent_id: str, agent_update: Agent) -> Optional[Agent]:
    """Updates an existing agent in the in-memory DB."""
    if agent_id not in _agents_db:
        return None
    _agents_db[agent_id] = agent_update
    # Ensure the ID in the updated object matches the path ID
    if agent_update.id != agent_id:
         # This case should ideally be handled by a Pydantic model that makes id immutable or validated upstream
         # For now, we overwrite if they try to change it via payload, or we could raise an error.
         # Let's assume for now the agent_update.id is the correct one if it differs.
         # A more robust solution would involve specific update models (e.g., AgentUpdate)
         # that might not include `id` or handle it differently.
        _agents_db[agent_update.id] = _agents_db.pop(agent_id) # If ID changes, re-key
    return _agents_db[agent_update.id]

def delete_agent_from_db(agent_id: str) -> Optional[Agent]:
    """Deletes an agent from the in-memory DB by ID."""
    return _agents_db.pop(agent_id, None) 