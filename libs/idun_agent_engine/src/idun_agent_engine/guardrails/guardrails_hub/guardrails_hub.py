"""Guardrails."""

from idun_agent_schema.engine.guardrails import Guardrails

from ..base import Guardrail

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


class GuardrailsHub(Guardrail):
    """wip."""

    # Guardrail(type=<GuardrailType.GUARDRAILS_HUB: 'guardrails_hub'>
    # config=GuardrailBanList(message='test', ban_words=['hello', 'bye'])),

    def __init__(self, config: Guardrails) -> None:
        super().__init__(config)
        self._instance_config = self._guardrail_config.config

    def _map_guard_to_class(self) -> None
        pass
