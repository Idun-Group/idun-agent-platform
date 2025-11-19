"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""

import inspect
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ..core.config_builder import ConfigBuilder


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""
    # Load config and initialize agent on startup
    print("Server starting up...")
    if not app.state.engine_config:
        raise ValueError("Error: No Engine configuration found.")

    engine_config = app.state.engine_config
    guardrails = app.state.engine_config.guardrails

    # Use ConfigBuilder's centralized agent initialization
    try:
        agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config)
    except Exception as e:
        raise ValueError(
            f"Error retrieving agent instance from ConfigBuilder: {e}"
        ) from e

    app.state.agent = agent_instance
    app.state.config = engine_config
    app.state.guardrails = guardrails
    # Store both in app state
    agent_name = getattr(agent_instance, "name", "Unknown")
    print(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    yield

    # Clean up on shutdown
    print("🔄 Idun Agent Engine shutting down...")
    agent = getattr(app.state, "agent", None)
    if agent is not None:
        close_fn = getattr(agent, "close", None)
        if callable(close_fn):
            result = close_fn()
            if inspect.isawaitable(result):
                await result
    print("✅ Agent resources cleaned up successfully.")
