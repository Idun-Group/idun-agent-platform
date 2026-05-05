"""Dispatcher helpers that emit A2UI envelopes as LangGraph custom events.

These run inside a LangGraph node and rely on the active
``RunnableConfig`` passed to the node. The AG-UI adapter listens for
``on_custom_event`` events from ``astream_events(version="v2")`` and
turns them into AG-UI ``CustomEvent`` frames on ``/agent/run`` SSE.
"""

from __future__ import annotations

from typing import Any

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.runnables import RunnableConfig

from idun_agent_engine.a2ui.envelope import (
    BASIC_CATALOG_V09,
    build_emit_envelope,
    build_update_envelope,
)

CUSTOM_EVENT_NAME = "idun.a2ui.messages"


async def emit_surface(
    config: RunnableConfig,
    *,
    surface_id: str,
    components: list[dict[str, Any]],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    send_data_model: bool = True,
) -> None:
    """Dispatch an A2UI v0.9 envelope (createSurface + updateComponents
    + optional updateDataModel) as a LangGraph custom event named
    ``idun.a2ui.messages``.

    Must be called from inside a LangGraph node where ``config`` is
    available (the second positional arg of the node function). The
    event reaches the AG-UI adapter via ``astream_events(version="v2")``.

    For interactive inputs (TextField, CheckBox, Slider, etc.) pass
    a ``data`` dict to seed the surface's dataModel and bind input
    ``value`` props to JSON Pointer paths::

        await emit_surface(
            config=config,
            surface_id="form",
            components=[
                {"id": "name", "component": "TextField", "label": "Name",
                 "value": {"path": "/name"}},
            ],
            data={"name": ""},
        )

    Without ``data``, inputs render but user edits do not update because
    the renderer has no dataModel target for ``setValue``.

    ``send_data_model`` controls whether the surface's dataModel is
    forwarded to the agent on action clicks; default ``True``.

    Pure JSON only — non-serializable values in ``components``,
    ``metadata``, or ``data`` will be silently dropped by
    ag-ui-langgraph's ``dump_json_safe``.
    """
    envelope = build_emit_envelope(
        surface_id=surface_id,
        components=components,
        fallback_text=fallback_text,
        catalog_id=catalog_id,
        metadata=metadata,
        data=data,
        send_data_model=send_data_model,
    )
    await adispatch_custom_event(CUSTOM_EVENT_NAME, envelope, config=config)


async def update_components(
    config: RunnableConfig,
    *,
    surface_id: str,
    components: list[dict[str, Any]],
) -> None:
    """Dispatch an ``updateComponents``-only envelope. Use after a
    prior ``emit_surface`` call to update components on an existing
    surface incrementally.
    """
    envelope = build_update_envelope(surface_id=surface_id, components=components)
    await adispatch_custom_event(CUSTOM_EVENT_NAME, envelope, config=config)
