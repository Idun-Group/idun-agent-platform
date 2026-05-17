"""Active prompts snapshot. Standalone sets it on boot and reload; the
``get_prompts()`` helper reads it before falling through to YAML / Manager.
Mirrors ``idun_agent_engine.mcp.registry``."""

from __future__ import annotations

from idun_agent_schema.engine.prompt import PromptConfig

_active_prompts: list[PromptConfig] | None = None


def set_active_prompts(prompts: list[PromptConfig] | None) -> None:
    """Replace the snapshot. ``None`` clears it."""
    global _active_prompts
    _active_prompts = list(prompts) if prompts is not None else None


def get_active_prompts() -> list[PromptConfig] | None:
    """Return a shallow copy of the snapshot, or ``None`` if unset.

    A copy guards against callers mutating the registry's backing list in
    place; mutations should always go through :func:`set_active_prompts`.
    """
    return None if _active_prompts is None else list(_active_prompts)
