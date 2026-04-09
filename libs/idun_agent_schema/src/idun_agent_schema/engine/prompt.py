"""Prompt configuration model."""

from __future__ import annotations

from typing import Any

from jinja2 import StrictUndefined
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
            env_str = env.from_string(self.content)
            return env_str.render(**kwargs)
        except Exception as e:
            raise ValueError(
                f"Failed to render prompt '{self.prompt_id}' v{self.version}. "
                f"Check the variables passed to render(): {e}"
            ) from e

    def to_langchain(self) -> PromptTemplate:  # noqa: F821
        """Convert to a LangChain PromptTemplate with Jinja2 template format."""
        try:
            from langchain_core.prompts import PromptTemplate
        except ImportError:
            raise ImportError(
                "langchain-core is required for to_langchain(). "
                "Install it with: pip install langchain-core"
            )
        return PromptTemplate.from_template(self.content, template_format="jinja2")
