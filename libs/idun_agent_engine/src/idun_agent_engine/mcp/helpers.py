from pathlib import Path
from typing import Any
import yaml
import requests
import os
from idun_agent_engine.mcp.registry import MCPClientRegistry
from idun_agent_schema.engine.mcp_server import MCPServer


def _extract_mcp_configs(config_data: dict[str, Any]) -> list[MCPServer]:
    """Parse MCP server configs from a config dictionary."""
    mcp_configs_data = config_data.get("mcp_servers") or config_data.get("mcpServers")
    if not mcp_configs_data:
        return []
    return [MCPServer.model_validate(c) for c in mcp_configs_data]


def _unwrap_engine_config(config_data: dict[str, Any]) -> dict[str, Any]:
    """Return engine-level config if wrapped under engine_config."""
    if not isinstance(config_data, dict):
        raise ValueError("Configuration payload is empty or invalid")
    if "engine_config" in config_data:
        return config_data["engine_config"]
    return config_data


def _build_registry(config_data: dict[str, Any]) -> MCPClientRegistry | None:
    """Instantiate an MCP client registry from config data."""
    mcp_configs = _extract_mcp_configs(config_data)
    if not mcp_configs:
        return None
    return MCPClientRegistry(mcp_configs)


def _get_toolsets_from_data(config_data: dict[str, Any]) -> list[Any]:
    """Internal helper to extract ADK toolsets from config dictionary."""
    registry = _build_registry(config_data)
    if not registry:
        return []
    try:
        return registry.get_adk_toolsets()
    except ImportError:
        raise


async def _get_langchain_tools_from_data(config_data: dict[str, Any]) -> list[Any]:
    """Internal helper to extract LangChain tools from config dictionary."""
    registry = _build_registry(config_data)
    if not registry:
        return []
    return await registry.get_tools()


def _load_config_from_file(config_path: str | Path) -> dict[str, Any]:
    """Load YAML config (optionally wrapped in engine_config) from disk."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found at {path}")

    with open(path) as f:
        config_data = yaml.safe_load(f)

    return _unwrap_engine_config(config_data)


def _fetch_config_from_api() -> dict[str, Any]:
    """Fetch configuration from the Idun Manager API."""
    api_key = os.environ.get("IDUN_AGENT_API_KEY")
    manager_host = os.environ.get("IDUN_MANAGER_HOST")

    if not api_key:
        raise ValueError("Environment variable 'IDUN_AGENT_API_KEY' is not set")

    if not manager_host:
        raise ValueError("Environment variable 'IDUN_MANAGER_HOST' is not set")

    headers = {"auth": f"Bearer {api_key}"}
    url = f"{manager_host.rstrip('/')}/api/v1/agents/config"

    try:
        response = requests.get(url=url, headers=headers)
        response.raise_for_status()
        config_data = yaml.safe_load(response.text)
        return _unwrap_engine_config(config_data)
    except requests.RequestException as e:
        raise ValueError(f"Failed to fetch config from API: {e}") from e
    except yaml.YAMLError as e:
        raise ValueError(f"Failed to parse config YAML: {e}") from e


def get_adk_tools_from_file(config_path: str | Path) -> list[Any]:
    """
    Loads MCP configurations from a YAML file and returns a list of ADK toolsets.

    Args:
        config_path: Path to the configuration YAML file.

    Returns:
        List of initialized ADK McpToolset instances.
    """
    config_data = _load_config_from_file(config_path)
    return _get_toolsets_from_data(config_data)


def get_adk_tools_from_api() -> list[Any]:
    """
    Fetches configuration from the Idun Manager API and returns a list of ADK toolsets.

    Returns:
        List of initialized ADK McpToolset instances.
    """
    config_data = _fetch_config_from_api()
    return _get_toolsets_from_data(config_data)


def get_adk_tools(config_path: str | Path | None = None) -> list[Any]:
    """
    Returns ADK toolsets using config from file when provided, otherwise from API.

    Returns:
        List of initialized ADK McpToolset instances.
    """
    if config_path:
        return get_adk_tools_from_file(config_path)
    return get_adk_tools_from_api()


async def get_langchain_tools_from_file(config_path: str | Path) -> list[Any]:
    """
    Loads MCP configurations from a YAML file and returns LangChain tool instances.
    """
    config_data = _load_config_from_file(config_path)
    return await _get_langchain_tools_from_data(config_data)


async def get_langchain_tools_from_api() -> list[Any]:
    """
    Fetches configuration from the Idun Manager API and returns LangChain tool instances.
    """
    config_data = _fetch_config_from_api()
    return await _get_langchain_tools_from_data(config_data)


async def get_langchain_tools(config_path: str | Path | None = None) -> list[Any]:
    """
    Returns LangChain tool instances using config from file when provided, otherwise from API.
    """
    if config_path:
        return await get_langchain_tools_from_file(config_path)
    return await get_langchain_tools_from_api()
