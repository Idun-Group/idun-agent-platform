"""Prompt configuration model."""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class PromptConfig(BaseModel):
    """Engine-level prompt configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    prompt_id: str = Field(..., description="Logical prompt identifier")
    version: int = Field(..., description="Prompt version number")
    content: str = Field(..., description="Prompt text, supports Jinja2 variables")
    tags: list[str] = Field(default_factory=list, description="Prompt tags")
