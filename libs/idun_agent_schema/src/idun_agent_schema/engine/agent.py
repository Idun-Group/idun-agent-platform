"""Common agent model definitions (engine)."""

from typing import Any

from pydantic import BaseModel, Field

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.langgraph import LangGraphAgentConfig
from idun_agent_schema.engine.haystack import HaystackAgentConfig
from idun_agent_schema.engine.base_agent import BaseAgentConfig
from pydantic import model_validator


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: AgentFramework
    config: BaseAgentConfig | LangGraphAgentConfig | HaystackAgentConfig

    @model_validator(mode="after")
    def _validate_framework_config(self) -> "AgentConfig":
        """Ensure the `config` type matches the selected framework.

        - LANGGRAPH  -> LangGraphAgentConfig
        - HAYSTACK   -> HaystackAgentConfig
        - ADK/CREWAI/CUSTOM -> BaseAgentConfig (or subclass)
        """
        expected_type: type[BaseAgentConfig] | None = None

        if self.type == AgentFramework.LANGGRAPH:
            expected_type = LangGraphAgentConfig
        elif self.type == AgentFramework.HAYSTACK:
            expected_type = HaystackAgentConfig
        elif self.type in {AgentFramework.ADK, AgentFramework.CREWAI, AgentFramework.CUSTOM}:
            expected_type = BaseAgentConfig

        if expected_type is not None and not isinstance(self.config, expected_type):
            raise ValueError(
                f"config must be {expected_type.__name__} when type is {self.type}"
            )

        return self
