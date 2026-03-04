"""Prompt configuration model."""

from typing import Any

from jinja2 import StrictUndefined, TemplateError
from jinja2.sandbox import SandboxedEnvironment
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

    def format(self, **kwargs: Any) -> str:
        """Render Jinja2 template variables in the prompt content."""
        try:
            env = SandboxedEnvironment(undefined=StrictUndefined)
            return env.from_string(self.content).render(**kwargs)
        except TemplateError as e:
            raise ValueError(
                f"Failed to render prompt '{self.prompt_id}' v{self.version}. "
                f"Check the variables passed to render(): {e}"
            ) from e
