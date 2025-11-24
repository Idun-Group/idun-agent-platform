"""Configuration models for Agent Templates."""

from typing import Literal

from pydantic import Field

from .base_agent import BaseAgentConfig


class TranslationAgentConfig(BaseAgentConfig):
    """Configuration model for the Translation Agent Template."""

    source_lang: str = Field(description="Source language to translate from", default="English")
    target_lang: str = Field(description="Target language to translate to", default="French")
    model_name: str = Field(description="LLM model to use", default="gpt-3.5-turbo")
