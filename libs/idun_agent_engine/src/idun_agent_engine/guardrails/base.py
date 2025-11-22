from abc import ABC, abstractmethod
from typing import Any

from idun_agent_schema.engine.guardrails import Guardrail


class BaseGuardrail(ABC):
    """Base class for different guardrail providers."""

    # TODO: output

    def __init__(self, config: Guardrail) -> None:
        if not isinstance(config, Guardrail):
            raise TypeError(
                f"The Guardrail must be a `Guardrail` schema type, received instead: {type(config)}"
            )
        self._guardrail_config = config
        # config for the specific guardrails type. currently, can only be guardrails_hub config
        self._instance_config: dict[str, Any] = None

    @abstractmethod
    def validate(self, input: str) -> bool:
        """Used for validating user input, or LLM output."""
        pass
