import yaml
from pathlib import Path
from src.agent_frameworks.langgraph_agent import LanggraphAgent
from src.server.internal.app_config import AppConfig
from functools import lru_cache
from fastapi import Request

@lru_cache(maxsize=1)
def load_config(config_path: str = "config.yaml"):
    path = Path(config_path)
    if not path.is_absolute():
        # Correctly resolve the path relative to the project root
        project_root = Path(__file__).parent.parent.parent
        path = project_root / path

    with open(path, 'r') as f:
        config_data = yaml.safe_load(f)
    return AppConfig.model_validate(config_data)

async def get_agent(request: Request):
    """
    Dependency to get the pre-initialized agent instance from the app state.
    """
    if hasattr(request.app.state, "agent"):
        return request.app.state.agent
    else:
        # This is a fallback for cases where the lifespan event did not run,
        # like in some testing scenarios.
        # Consider logging a warning here.
        app_config = load_config()
        agent_config = app_config.agent

        if agent_config.type == "langgraph":
            agent = LanggraphAgent()
            await agent.initialize(agent_config.config)
            return agent
        # Other agent types would follow the same pattern
        raise ValueError(f"Agent not found in app state and could not be created for type: {agent_config.type}")
