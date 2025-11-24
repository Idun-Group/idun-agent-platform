from __future__ import annotations

from idun_agent_schema.engine.langgraph import LangGraphAgentConfig

from .correction_agent_arguments import CorrectionAgentArguments


class CorrectionAgent(LangGraphAgentConfig):
    template_parameters: CorrectionAgentArguments