"""Prompt helpers for loading PromptConfig entries from file or API."""

import logging
import os
from pathlib import Path
from typing import Any

import requests
import yaml
from idun_agent_schema.engine.prompt import PromptConfig

logger = logging.getLogger(__name__)


def _unwrap_engine_config(config_data: object) -> dict[str, Any]:
    """Return engine-level config, unwrapping engine_config wrapper if present."""
    if not isinstance(config_data, dict):
        raise ValueError("Configuration payload is empty or invalid")
    if "engine_config" in config_data:
        return config_data["engine_config"]
    return config_data


def _extract_prompts(config_data: dict[str, Any]) -> list[PromptConfig]:
    """Parse prompt entries from a config dictionary."""
    prompts_raw = config_data.get("prompts")
    if not prompts_raw:
        return []
    return [PromptConfig.model_validate(p) for p in prompts_raw]


def get_prompts_from_file(config_path: str | Path) -> list[PromptConfig]:
    """Load prompts from a YAML config file."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found at {path}")

    with open(path) as f:
        raw = yaml.safe_load(f)

    config_data = _unwrap_engine_config(raw)
    prompts = _extract_prompts(config_data)
    logger.debug("Loaded %d prompt(s) from file %s", len(prompts), path)
    return prompts


def get_prompts_from_api() -> list[PromptConfig]:
    """Fetch prompts from the Idun Manager API."""
    api_key = os.environ.get("IDUN_AGENT_API_KEY")
    manager_host = os.environ.get("IDUN_MANAGER_HOST")

    if not api_key:
        raise ValueError("Environment variable 'IDUN_AGENT_API_KEY' is not set")
    if not manager_host:
        raise ValueError("Environment variable 'IDUN_MANAGER_HOST' is not set")

    host = manager_host.removesuffix("/")
    url = f"{host}/api/v1/agents/config"
    headers = {"auth": f"Bearer {api_key}"}

    try:
        response = requests.get(url=url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        raise ValueError(f"Failed to fetch config from API: {e}") from e

    try:
        raw = yaml.safe_load(response.text)
    except yaml.YAMLError as e:
        raise ValueError(f"Failed to parse config YAML: {e}") from e

    config_data = _unwrap_engine_config(raw)
    prompts = _extract_prompts(config_data)
    logger.info("Loaded %d prompt(s) from manager API", len(prompts))
    return prompts


def get_prompts(config_path: str | Path | None = None) -> list[PromptConfig]:
    """Return prompts: config_path > IDUN_CONFIG_PATH env > Manager API."""
    if config_path:
        return get_prompts_from_file(config_path)

    env_config_path = os.environ.get("IDUN_CONFIG_PATH")
    if env_config_path:
        return get_prompts_from_file(env_config_path)

    return get_prompts_from_api()


def get_prompt(
    prompt_id: str, config_path: str | Path | None = None
) -> PromptConfig | None:
    """Return the first prompt matching prompt_id, or None."""
    prompts = get_prompts(config_path=config_path)
    for p in prompts:
        if p.prompt_id == prompt_id:
            logger.debug("Resolved prompt '%s' (version %d)", prompt_id, p.version)
            return p
    logger.debug("Prompt '%s' not found", prompt_id)
    return None
