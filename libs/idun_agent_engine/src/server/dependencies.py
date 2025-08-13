from fastapi import Request

from ..core.config_builder import ConfigBuilder


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
        print("⚠️  Agent not found in app state, initializing fallback agent...")

        app_config = ConfigBuilder.load_from_file()
        agent = await ConfigBuilder.initialize_agent_from_config(app_config)
        return agent
