"""A2UI v0.9 emission helpers for LangGraph agents.

Public API:
    emit_surface — dispatch a createSurface + updateComponents envelope
    update_components — dispatch an updateComponents-only envelope
    BASIC_CATALOG_V09 — default catalog URI

See ``docs/superpowers/specs/2026-04-30-ws2-a2ui-mvp1-design.md`` for
the design rationale.
"""

from idun_agent_engine.a2ui.actions import (
    A2UIClientAction,
    A2UIClientDataModel,
    A2UIClientMessage,
    A2UIContext,
    read_a2ui_context,
)
from idun_agent_engine.a2ui.envelope import BASIC_CATALOG_V09
from idun_agent_engine.a2ui.helpers import emit_surface, update_components

__all__ = [
    "A2UIClientAction",
    "A2UIClientDataModel",
    "A2UIClientMessage",
    "A2UIContext",
    "BASIC_CATALOG_V09",
    "emit_surface",
    "read_a2ui_context",
    "update_components",
]
