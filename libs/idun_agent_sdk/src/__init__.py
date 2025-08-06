"""
Idun Agent SDK - A framework for building and deploying conversational AI agents

This SDK provides a unified interface for different agent frameworks (LangGraph, CrewAI, etc.)
and automatically generates a production-ready FastAPI server for your agents.

Quick Start:
    from idun_agent_sdk import create_app, run_server
    
    # Create your FastAPI app with your agent
    app = create_app(config_path="path/to/your/config.yaml")
    
    # Run the server
    run_server(app, port=8000)

For more advanced usage, see the documentation.
"""

from .core.app_factory import create_app
from .core.server_runner import run_server
from .core.config_builder import ConfigBuilder
from .agent_frameworks.base_agent import BaseAgent

# Version information
__version__ = "0.1.0"

# Main public API
__all__ = [
    "create_app",
    "run_server", 
    "ConfigBuilder",
    "BaseAgent",
    "__version__"
]
