"""Configuration models for Agent Templates."""


from pydantic import Field

from .langgraph import LangGraphAgentConfig


class TranslationAgentConfig(LangGraphAgentConfig):
    """Configuration model for the Translation Agent Template."""

    source_lang: str = Field(
        description="Source language to translate from", default="English"
    )
    target_lang: str = Field(
        description="Target language to translate to", default="French"
    )
    model_name: str = Field(description="LLM model to use", default="gpt-3.5-turbo")
