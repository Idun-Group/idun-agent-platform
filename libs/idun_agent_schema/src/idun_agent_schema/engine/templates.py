"""Configuration models for Agent Templates."""

from typing import Literal

from pydantic import Field

from .base_agent import BaseAgentConfig
from .langgraph import CheckpointConfig


class TranslationAgentConfig(BaseAgentConfig):
    """Configuration model for the Translation Agent Template."""

    source_lang: str = Field(description="Source language to translate from", default="English")
    target_lang: str = Field(description="Target language to translate to", default="French")
    model_name: str = Field(description="LLM model to use", default="gpt-3.5-turbo")
    checkpointer: CheckpointConfig | None = None


class CorrectionAgentConfig(BaseAgentConfig):
    """Configuration model for the Correction Agent Template."""

    language: str = Field(description="Language to correct text in", default="French")
    model_name: str = Field(description="LLM model to use", default="gemini-2.5-flash")
    checkpointer: CheckpointConfig | None = None


class DeepResearchAgentConfig(BaseAgentConfig):
    """Configuration model for the Deep Research Agent Template."""

    model_name: str = Field(description="LLM model to use", default="gemini-2.5-flash")
    project: str = Field(description="Project identifier")
    region: str = Field(description="Region identifier")
    tavily_api_key: str = Field(description="Tavily API key for web search")
    system_prompt: str = Field(description="System prompt for the agent", default="Conduct research and write a polished report.")
    checkpointer: CheckpointConfig | None = None
