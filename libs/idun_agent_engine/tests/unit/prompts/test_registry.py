"""Tests for idun_agent_engine.prompts.registry."""

from __future__ import annotations

import pytest
from idun_agent_schema.engine.prompt import PromptConfig

from idun_agent_engine.prompts.registry import (
    get_active_prompts,
    set_active_prompts,
)


@pytest.fixture(autouse=True)
def _clear_registry():
    """Reset between tests so module-level state doesn't bleed."""
    set_active_prompts(None)
    yield
    set_active_prompts(None)


def _prompt(prompt_id: str, version: int = 1, content: str = "hi") -> PromptConfig:
    return PromptConfig.model_validate(
        {"prompt_id": prompt_id, "version": version, "content": content}
    )


def test_initial_state_is_none():
    assert get_active_prompts() is None


def test_set_then_get_roundtrips():
    a, b = _prompt("a"), _prompt("b")
    set_active_prompts([a, b])
    assert get_active_prompts() == [a, b]


def test_caller_list_mutation_does_not_bleed():
    """The registry copies the list so the caller can keep mutating its own."""
    caller_list = [_prompt("a")]
    set_active_prompts(caller_list)
    caller_list.append(_prompt("b"))
    snap = get_active_prompts()
    assert snap is not None
    assert len(snap) == 1


def test_set_none_clears():
    set_active_prompts([_prompt("a")])
    set_active_prompts(None)
    assert get_active_prompts() is None


def test_get_returns_defensive_copy():
    """The registry returns a shallow copy so callers cannot mutate
    the backing list in place."""
    set_active_prompts([_prompt("a")])
    snap = get_active_prompts()
    assert snap is not None
    snap.append(_prompt("b"))
    again = get_active_prompts()
    assert again is not None
    assert len(again) == 1
