"""Common agent model definitions (engine)."""


from pydantic import BaseModel, model_validator

from idun_agent_schema.engine.adk import AdkAgentConfig
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.base_agent import BaseAgentConfig
from idun_agent_schema.engine.haystack import HaystackAgentConfig
from idun_agent_schema.engine.langgraph import LangGraphAgentConfig
from idun_agent_schema.engine.templates import TranslationAgentConfig


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: AgentFramework
    config: (
        BaseAgentConfig
        | LangGraphAgentConfig
        | HaystackAgentConfig
        | AdkAgentConfig
        | TranslationAgentConfig
    )

    @model_validator(mode="after")
    def _validate_framework_config(self) -> "AgentConfig":
        """Ensure the `config` type matches the selected framework.

        - LANGGRAPH  -> LangGraphAgentConfig
        - HAYSTACK   -> HaystackAgentConfig
        - ADK        -> AdkAgentConfig
        - TRANSLATION_AGENT -> TranslationAgentConfig
        - CREWAI/CUSTOM -> BaseAgentConfig (or subclass)
        """
        expected_type: type[BaseAgentConfig] | None = None

        if self.type == AgentFramework.LANGGRAPH:
            expected_type = LangGraphAgentConfig
        elif self.type == AgentFramework.HAYSTACK:
            expected_type = HaystackAgentConfig
        elif self.type == AgentFramework.TRANSLATION_AGENT:
            expected_type = TranslationAgentConfig
        elif self.type == AgentFramework.ADK:
            expected_type = AdkAgentConfig
        elif self.type in {AgentFramework.CREWAI, AgentFramework.CUSTOM}:
            expected_type = BaseAgentConfig

        if expected_type is not None and not isinstance(self.config, expected_type):
            raise ValueError(
                f"config must be {expected_type.__name__} when type is {self.type}"
            )

        return self
