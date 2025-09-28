"""Configuration models for Haystack agents."""

from typing import Literal

from idun_agent_engine.core.engine_config import BaseAgentConfig


class HaystackAgentConfig(BaseAgentConfig):
    """Configuration model for Haystack Agents."""

    type: Literal["haystack"] = "haystack"
    component_type: Literal["pipeline", "agent"]
    component_definition: str
