"""
Idun Agent Engine - A framework for building and deploying conversational AI agents

This Engine provides a unified interface for different agent frameworks (LangGraph, CrewAI, etc.)
and automatically generates a production-ready FastAPI server for your agents.

Quick Start:
    from idun_agent_engine import ConfigBuilder, create_app, run_server
    
    # Method 1: Using ConfigBuilder (Recommended)
    config = (ConfigBuilder()
             .with_langgraph_agent(name="My Agent", graph_definition="agent.py:graph")
             .build())
    app = create_app(engine_config=config)
    run_server(app)
    
    # Method 2: Using YAML config file
    app = create_app(config_path="config.yaml")
    run_server(app, port=8000)
    
    # Method 3: One-liner from config file
    from idun_agent_engine.core.server_runner import run_server_from_config
    run_server_from_config("config.yaml")

For more advanced usage, see the documentation.
"""

# Version information - import from separate module to avoid circular imports
from ._version import __version__
from .agent.base import BaseAgent
from .core.app_factory import create_app
from .core.config_builder import ConfigBuilder
from .core.server_runner import (
    run_server,
    run_server_from_builder,
    run_server_from_config,
)

# Main public API
__all__ = [
    "create_app",
    "run_server",
    "run_server_from_config",
    "run_server_from_builder",
    "ConfigBuilder",
    "BaseAgent",
    "__version__"
]
