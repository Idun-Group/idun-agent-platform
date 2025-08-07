"""
Application Factory for Idun Agent Engine

This module provides the main entry point for users to create a FastAPI application
with their agent integrated. It handles all the complexity of setting up routes,
dependencies, and lifecycle management behind the scenes.
"""

from typing import Optional, Dict, Any, Union
from pathlib import Path
from fastapi import FastAPI
from contextlib import asynccontextmanager

from ..server.lifespan import lifespan
from ..server.routers.agent import agent_router
from ..server.routers.base import base_router
from .engine_config import EngineConfig
from .config_builder import ConfigBuilder
from ..agent_frameworks.langgraph_agent import LanggraphAgent


def create_app(
    config_path: Optional[str] = None, 
    config_dict: Optional[Dict[str, Any]] = None,
    engine_config: Optional[EngineConfig] = None
) -> FastAPI:
    """
    Create a FastAPI application with an integrated agent.
    
    This is the main entry point for users of the Idun Agent Engine. It creates a fully
    configured FastAPI application that serves your agent with proper lifecycle management,
    routing, and error handling.
    
    Args:
        config_path: Path to a YAML configuration file. If not provided, looks for 'config.yaml'
                    in the current directory.
        config_dict: Dictionary containing configuration. If provided, takes precedence over config_path.
                    Useful for programmatic configuration.
        engine_config: Pre-validated EngineConfig instance (from ConfigBuilder.build()). 
                      Takes precedence over other options.
    
    Returns:
        FastAPI: A configured FastAPI application ready to serve your agent.
    
    Example:
        # Using a config file
        app = create_app("my_agent_config.yaml")
        
        # Using a config dictionary
        config = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "langgraph",
                "config": {
                    "name": "My Agent",
                    "graph_definition": "my_agent.py:graph"
                }
            }
        }
        app = create_app(config_dict=config)
        
        # Using ConfigBuilder (recommended)
        from idun_agent_engine import ConfigBuilder
        config = (ConfigBuilder()
                 .with_langgraph_agent(name="My Agent", graph_definition="my_agent.py:graph")
                 .build())
        app = create_app(engine_config=config)
    """
    
    # Resolve configuration from various sources using ConfigBuilder's umbrella function
    validated_config = ConfigBuilder.resolve_config(
        config_path=config_path,
        config_dict=config_dict,
        engine_config=engine_config
    )
        
    # Create the FastAPI application
    app = FastAPI(
        lifespan=lifespan,
        title="Idun Agent Engine Server",
        description="A production-ready server for conversational AI agents",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Store configuration in app state for lifespan to use
    app.state.engine_config = validated_config

    # Include the routers
    app.include_router(agent_router, prefix="/agent", tags=["Agent"])
    app.include_router(base_router, tags=["Base"])

    return app 