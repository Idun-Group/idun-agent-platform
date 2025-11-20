"""Dependency injection helpers for FastAPI routes."""

from fastapi import Request

from ..core.config_builder import ConfigBuilder


async def get_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
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

async def get_copilotkit_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
    """
    if hasattr(request.app.state, "copilotkit_agent"):
        return request.app.state.copilotkit_agent
    else:
        # This is a fallback for cases where the lifespan event did not run,
        # like in some testing scenarios.
        # Consider logging a warning here.
        print("⚠️  CopilotKit agent not found in app state, initializing fallback agent...")

        app_config = ConfigBuilder.load_from_file()
        copilotkit_agent = await ConfigBuilder.initialize_agent_from_config(app_config)
        return copilotkit_agent
