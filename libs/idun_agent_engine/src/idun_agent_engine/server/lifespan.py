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
    engine_config = app.state.engine_config

    # Use ConfigBuilder's centralized agent initialization
    agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config)

    # Store both in app state
    app.state.agent = agent_instance
    app.state.config = engine_config

    agent_name = getattr(agent_instance, "name", "Unknown")
    print(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    # Setup AGUI routes if the agent is a LangGraph agent
    from ..agent.langgraph.langgraph import LanggraphAgent
    from ..server.routers.agui import setup_agui_router

    if isinstance(agent_instance, LanggraphAgent):
        try:
            # compiled_graph = getattr(agent_instance, "agent_instance")
            setup_agui_router(app, agent_instance) # TODO: agent_instance is a compiled graph (duplicate agent_instance name not clear)
        except Exception as e:
            print(f"⚠️ Warning: Failed to setup AGUI routes: {e}")
            # Continue even if AGUI setup fails

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
