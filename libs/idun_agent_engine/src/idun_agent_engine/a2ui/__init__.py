"""A2UI v0.9 emission helpers for LangGraph agents.

Public API:
    emit_surface — dispatch a createSurface + updateComponents envelope
    update_components — dispatch an updateComponents-only envelope
    BASIC_CATALOG_V09 — default catalog URI

See ``docs/superpowers/specs/2026-04-30-ws2-a2ui-mvp1-design.md`` for
the design rationale.
"""

from idun_agent_engine.a2ui.envelope import BASIC_CATALOG_V09

__all__ = ["BASIC_CATALOG_V09"]
