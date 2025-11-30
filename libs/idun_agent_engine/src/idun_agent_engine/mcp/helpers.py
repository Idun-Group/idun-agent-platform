from pathlib import Path
from typing import Any
import yaml
import requests
import os
from idun_agent_engine.mcp.registry import MCPClientRegistry
from idun_agent_schema.engine.mcp_server import MCPServer

def _get_toolsets_from_data(config_data: dict[str, Any]) -> list[Any]:
    """Internal helper to extract toolsets from config dictionary."""
    # Handle both snake_case and camelCase for mcp_servers
    # Note: logic in ConfigBuilder suggests looking inside 'engine_config' if present,
    # but this helper expects the dictionary containing 'mcp_servers' directly
    # or performs the search itself.

    mcp_configs_data = config_data.get("mcp_servers") or config_data.get("mcpServers")

    if not mcp_configs_data:
        return []

    mcp_configs = [MCPServer.model_validate(c) for c in mcp_configs_data]
    registry = MCPClientRegistry(mcp_configs)

    try:
        return registry.get_adk_toolsets()
    except ImportError:
        raise

def get_adk_tools_from_file(config_path: str | Path) -> list[Any]:
    """
    Loads MCP configurations from a YAML file and returns a list of ADK toolsets.

    Args:
        config_path: Path to the configuration YAML file.

    Returns:
        List of initialized ADK McpToolset instances.
    """
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found at {path}")

    with open(path) as f:
        config_data = yaml.safe_load(f)

    # Check if wrapped in engine_config (common pattern in idun)
    if "engine_config" in config_data:
        config_data = config_data["engine_config"]

    return _get_toolsets_from_data(config_data)

def get_adk_tools_from_api() -> list[Any]:
    """
    Fetches configuration from the Idun Manager API and returns a list of ADK toolsets.

    Args:
        agent_api_key: The API key for authentication.
        manager_url: The base URL of the Idun Manager (e.g. http://localhost:8000).

    Returns:
        List of initialized ADK McpToolset instances.
    """
    api_key = os.environ.get("IDUN_AGENT_API_KEY")
    manager_host = os.environ.get("IDUN_MANAGER_HOST")
    headers = {"auth": f"Bearer {api_key}"}
    url = f"{manager_host.rstrip('/')}/api/v1/agents/config"

    try:
        response = requests.get(url=url, headers=headers)
        response.raise_for_status()

        config_data = yaml.safe_load(response.text)

        # Config from API is typically wrapped in engine_config
        if "engine_config" in config_data:
            config_data = config_data["engine_config"]

        return _get_toolsets_from_data(config_data)

    except requests.RequestException as e:
        raise ValueError(f"Failed to fetch config from API: {e}") from e
    except yaml.YAMLError as e:
        raise ValueError(f"Failed to parse config YAML: {e}") from e
