"""Tests for PromptConfig.format() method."""

import pytest
from idun_agent_schema.engine.prompt import PromptConfig


@pytest.mark.unit
class TestPromptConfigFormat:
    def test_formats_single_variable(self) -> None:
        prompt = PromptConfig(
            prompt_id="test", version=1, content="Hello {{ name }}!"
        )
        assert prompt.format(name="World") == "Hello World!"

    def test_formats_multiple_variables(self) -> None:
        prompt = PromptConfig(
            prompt_id="rag",
            version=1,
            content="Query: {{ query }}\n\nContext: {{ context }}",
        )
        result = prompt.format(query="What is AI?", context="AI is artificial intelligence.")
        assert result == "Query: What is AI?\n\nContext: AI is artificial intelligence."

    def test_raises_on_missing_variable(self) -> None:
        prompt = PromptConfig(
            prompt_id="test", version=1, content="Hello {{ name }}!"
        )
        with pytest.raises(ValueError, match="Check the variables passed to render"):
            prompt.format()

    def test_raises_on_bad_syntax(self) -> None:
        prompt = PromptConfig(
            prompt_id="bad", version=1, content="Hello {% if %}!"
        )
        with pytest.raises(ValueError, match="Check the variables passed to render"):
            prompt.format()

    def test_error_includes_prompt_id_and_version(self) -> None:
        prompt = PromptConfig(
            prompt_id="my-prompt", version=3, content="{{ missing }}"
        )
        with pytest.raises(ValueError, match="my-prompt.*v3"):
            prompt.format()

    def test_formats_with_no_variables_in_content(self) -> None:
        prompt = PromptConfig(
            prompt_id="static", version=1, content="No variables here."
        )
        assert prompt.format() == "No variables here."

    def test_extra_kwargs_ignored(self) -> None:
        prompt = PromptConfig(
            prompt_id="test", version=1, content="Hello {{ name }}!"
        )
        assert prompt.format(name="World", extra="ignored") == "Hello World!"
