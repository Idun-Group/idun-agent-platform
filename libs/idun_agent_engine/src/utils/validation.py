"""
Configuration and Setup Validation Utilities

This module provides functions to validate configurations, check agent setups,
and help users diagnose common issues.
"""

import importlib.util
from pathlib import Path
from typing import Any


def validate_config_dict(config: dict[str, Any]) -> list[str]:
    """
    Validate a configuration dictionary and return a list of issues.

    Args:
        config: Configuration dictionary to validate

    Returns:
        List[str]: List of validation errors (empty if valid)
    """
    errors = []

    # Check top-level structure
    if "engine" not in config:
        errors.append("Missing 'engine' section in configuration")
    if "agent" not in config:
        errors.append("Missing 'agent' section in configuration")
        return errors  # Can't continue without agent section

    # Validate agent section
    agent_config = config["agent"]
    if "type" not in agent_config:
        errors.append("Missing 'type' in agent configuration")
    if "config" not in agent_config:
        errors.append("Missing 'config' in agent configuration")

    # Validate specific agent types
    agent_type = agent_config.get("type")
    if agent_type == "langgraph":
        errors.extend(_validate_langgraph_config(agent_config.get("config", {})))

    return errors


def _validate_langgraph_config(config: dict[str, Any]) -> list[str]:
    """Validate LangGraph-specific configuration."""
    errors = []

    if "graph_definition" not in config:
        errors.append("LangGraph agent missing 'graph_definition'")
    else:
        errors.extend(_validate_graph_definition(config["graph_definition"]))

    # Validate checkpointer if present
    if "checkpointer" in config:
        checkpointer = config["checkpointer"]
        if not isinstance(checkpointer, dict):
            errors.append("Checkpointer must be a dictionary")
        elif checkpointer.get("type") == "sqlite":
            if "db_url" not in checkpointer:
                errors.append("SQLite checkpointer missing 'db_url'")

    return errors


def _validate_graph_definition(graph_def: str) -> list[str]:
    """Validate that a graph definition string is properly formatted and accessible."""
    errors = []

    try:
        module_path, variable_name = graph_def.rsplit(":", 1)
    except ValueError:
        errors.append(
            f"Graph definition '{graph_def}' must be in format 'path/to/file.py:variable_name'"
        )
        return errors

    # Check if file exists
    if not Path(module_path).exists():
        errors.append(f"Graph definition file '{module_path}' does not exist")
        return errors

    # Try to load the module (without executing it)
    try:
        spec = importlib.util.spec_from_file_location("temp_module", module_path)
        if spec is None:
            errors.append(f"Could not load module spec from '{module_path}'")
    except Exception as e:
        errors.append(f"Error loading module '{module_path}': {str(e)}")

    return errors


def check_agent_requirements(agent_type: str) -> list[str]:
    """
    Check if the required packages for an agent type are installed.

    Args:
        agent_type: The type of agent to check requirements for

    Returns:
        List[str]: List of missing requirements
    """
    missing = []

    if agent_type == "langgraph":
        try:
            import langgraph
        except ImportError:
            missing.append("langgraph")

        try:
            import aiosqlite
        except ImportError:
            missing.append("aiosqlite")

    return missing


def diagnose_setup() -> dict[str, Any]:
    """
    Run a comprehensive diagnosis of the current setup.

    Returns:
        Dict[str, Any]: Diagnosis results including versions, dependencies, etc.
    """
    diagnosis = {
        "python_version": None,
        "installed_packages": {},
        "system_info": {},
        "recommendations": [],
    }

    # Get Python version
    import sys

    diagnosis["python_version"] = sys.version

    # Check for common packages
    packages_to_check = ["fastapi", "uvicorn", "langgraph", "pydantic", "yaml"]
    for package in packages_to_check:
        try:
            module = __import__(package)
            diagnosis["installed_packages"][package] = getattr(
                module, "__version__", "unknown"
            )
        except ImportError:
            diagnosis["installed_packages"][package] = "not installed"

    # Add recommendations
    if diagnosis["installed_packages"].get("langgraph") == "not installed":
        diagnosis["recommendations"].append("Install langgraph: pip install langgraph")

    return diagnosis
