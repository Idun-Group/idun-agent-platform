"""Guardrails."""

from guardrails import Guard
from idun_agent_schema.engine.guardrails import Guardrail as GuardrailSchema

from ..base import Guardrail as GuardrailBase

"""
Config:  server=ServerConfig(api=ServerAPIConfig(port=8000))
agent=AgentConfig(type=<AgentFramework.LANGGRAPH: 'LANGGRAPH'>, config=LangGraphAgentConfig(name='Guardrails', input_schema_definition={}, output_schema_definition={}, observability=ObservabilityConfig(provider=None, enabled=False, options={}), graph_definition='example_agent.py:app', checkpointer=None, store=None))
guardrails=Guardrails(enabled=True,
input=[
      Guardrail(type=<GuardrailType.CUSTOM_LLM: 'custom_llm'>, config=LLMGuard(message='Cannot answer', model_name='gemini-2.5', prompt='hello'))
      Guardrail(type=<GuardrailType.CUSTOM_LLM: 'custom_llm'>, config=LLMGuard(message='Cannot answer', model_name='gemini-2.5', prompt='hello'))
      ]

output=[
       Guardrail(type=<GuardrailType.GUARDRAILS_HUB: 'guardrails_hub'>, config=GuardrailBanList(message='test', ban_words=['hello', 'bye'])),
       Guardrail(type=<GuardrailType.CUSTOM_LLM: 'custom_llm'>, config=LLMGuard(message='Cannot answer', model_name='gemini-2.5', prompt='hello'))
       ]
       )
"""


class GuardrailsHubGuard(GuardrailBase):
    """Class for managing guardrails from `guardrailsai`'s hub."""

    # Guardrail(type=<GuardrailType.GUARDRAILS_HUB: 'guardrails_hub'>
    # config=GuardrailBanList(message='test', ban_words=['hello', 'bye'])),

    def __init__(self, config: GuardrailSchema) -> None:
        super().__init__(config)
        self._guard_config = self._guardrail_config.config
        self._guard_type = self._guardrail_config.type
        self._guard: Guard | None = None

    def _map_guard(self) -> None:
        """Maps the `guard` instance based on its type, by calling the resolve_guard method."""
        from .utils import resolve_class

        guard = resolve_class(self._type)
        self._guard = guard
