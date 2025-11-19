from abc import ABC, abstractmethod

from idun_agent_schema.engine.guardrails import Guardrail, GuardrailBanList


class Guardrail(ABC):
    """Base class for different guardrail providers."""

    def __init__(self, config: Guardrail) -> None:
        if not isinstance(config, Guardrail):
            raise TypeError(
                f"The Guardrail must be a `Guardrail` schema type, received instead: {type(config)}"
            )
        self._guardrail_config = config
        # config for the specific guardrails type. currently, can only be guardrails_hub config
        self._instance_config: GuardrailBanList = None

    @abstractmethod
    def validate(self, input: str) -> bool:
        """Used for validating user input, or LLM output."""
        pass
