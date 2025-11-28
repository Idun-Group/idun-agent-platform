"""Application Factory for Idun Agent Engine.

This module provides the main entry point for users to create a FastAPI
application with their agent integrated. It handles all the complexity of
setting up routes, dependencies, and lifecycle management behind the scenes.
"""

from typing import Any

from fastapi import FastAPI

from .._version import __version__
from ..server.lifespan import lifespan
from ..server.routers.agent import agent_router
from ..server.routers.base import base_router
from .config_builder import ConfigBuilder
from .engine_config import EngineConfig


def create_app(
    config_path: str | None = None,
    config_dict: dict[str, Any] | None = None,
    engine_config: EngineConfig | None = None,
) -> FastAPI:
    """Create a FastAPI application with an integrated agent.

    This is the main entry point for users of the Idun Agent Engine. It creates a
    fully configured FastAPI application that serves your agent with proper
    lifecycle management, routing, and error handling.

    Args:
        config_path: Optional path to a YAML configuration file. If not provided,
            looks for 'config.yaml' in the current directory.
        config_dict: Optional dictionary containing configuration. If provided,
            takes precedence over config_path. Useful for programmatic configuration.
        engine_config: Pre-validated EngineConfig instance (from ConfigBuilder.build()).
            Takes precedence over other options.

    Returns:
        FastAPI: A configured FastAPI application ready to serve your agent.
    """
    # Resolve configuration from various sources using ConfigBuilder's umbrella function
    validated_config = ConfigBuilder.resolve_config(
        config_path=config_path, config_dict=config_dict, engine_config=engine_config
    )

    # Create the FastAPI application
    app = FastAPI(
        lifespan=lifespan,
        title="Idun Agent Engine Server",
        description="A production-ready server for conversational AI agents",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Store configuration in app state for lifespan to use
    app.state.engine_config = validated_config

    # Include the routers
    app.include_router(agent_router, prefix="/agent", tags=["Agent"])
    app.include_router(base_router, tags=["Base"])

    return app
