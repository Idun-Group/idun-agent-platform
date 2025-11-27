from __future__ import annotations

from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from .translation_agent_arguments import TranslationAgentArguments


class TranslationAgent(LangGraphAgentConfig):
    template_parameters: TranslationAgentArguments
