from __future__ import annotations

from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from .deep_research_agent_arguments import DeepResearchAgentArguments


class DeepResearchAgent(LangGraphAgentConfig):
    template_parameters: DeepResearchAgentArguments
