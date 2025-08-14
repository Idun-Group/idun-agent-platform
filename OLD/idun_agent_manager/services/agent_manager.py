from typing import Dict
from idun_agent_manager.core.iagent import IAgent
from idun_agent_manager.core.agents.langgraph_agent_impl import LanggraphAgent
from idun_agent_manager.core.agents.adk_agent_impl import ADKAgent
from idun_agent_manager.core.agents.smol_agent_impl import SmolAgent
from idun_agent_manager.db import sqlite_db
from idun_agent_manager.models.agent_models import FrameworkType


class AgentManager:
    """
    Manages the lifecycle of active agent instances.
    This is a singleton class to ensure only one manager exists.
    """

    _instance = None
    _active_agents: Dict[str, IAgent]

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AgentManager, cls).__new__(cls)
            cls._active_agents = {}
        return cls._instance

    async def get_or_load_agent(self, agent_id: str) -> IAgent:
        """
        Retrieves an active agent instance. If not active, it loads the
        agent from the database into memory.
        """
        if agent_id in self._active_agents:
            return self._active_agents[agent_id]

        print(f"Agent {agent_id} not active. Loading from database...")
        agent_model = sqlite_db.get_agent_from_db(agent_id)

        if not agent_model:
            raise ValueError(f"Agent with ID {agent_id} not found in the database.")

        # Add agent_id from the model to the config for the instance
        agent_config = agent_model.config.copy()
        agent_config["id"] = agent_model.id
        agent_config["name"] = agent_model.name

        if agent_model.framework_type == FrameworkType.LANGGRAPH:
            agent_instance = LanggraphAgent()
            await agent_instance.initialize(agent_config)
        elif agent_model.framework_type == FrameworkType.ADK:
            # ADKAgent's initialize is not fully async, but we await it for consistency
            agent_instance = ADKAgent()
            await agent_instance.initialize(agent_config)
        elif agent_model.framework_type == FrameworkType.SMOL:
            agent_instance = SmolAgent()
            await agent_instance.initialize(agent_config)
        else:
            raise NotImplementedError(
                f"Framework {agent_model.framework_type} not supported."
            )

        self._active_agents[agent_id] = agent_instance
        print(f"Agent {agent_id} loaded and activated.")
        return agent_instance

    async def unload_agent(self, agent_id: str):
        """
        Deactivates an agent and closes any open resources.
        """
        if agent_id in self._active_agents:
            agent = self._active_agents.pop(agent_id)
            if hasattr(agent, "close"):
                await agent.close()
            print(f"Agent {agent_id} unloaded.")


# Singleton instance of the manager
agent_manager = AgentManager()
