"""A2UI v0.9 envelope builders.

Pure functions. No I/O, no LangGraph imports. The dispatcher in
``helpers.py`` calls these and forwards the result to
``adispatch_custom_event``.
"""

from __future__ import annotations

from typing import Any

#: Default catalog URI for A2UI v0.9 Basic Catalog.
#: See https://a2ui.org/specification/v0_9/basic_catalog.json
BASIC_CATALOG_V09 = "https://a2ui.org/specification/v0_9/basic_catalog.json"


def build_emit_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the A2UI v0.9 envelope for a ``createSurface`` + ``updateComponents``
    pair (the common one-shot case).

    The returned dict becomes ``CustomEvent.value`` once the dispatcher
    fires it through ``adispatch_custom_event``.
    """
    envelope: dict[str, Any] = {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "messages": [
            {
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": catalog_id,
                },
            },
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": list(components),
                },
            },
        ],
    }
    if fallback_text is not None:
        envelope["fallbackText"] = fallback_text
    if metadata is not None:
        envelope["metadata"] = dict(metadata)
    return envelope


def build_update_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the A2UI v0.9 envelope for an ``updateComponents``-only
    incremental update (after a prior emit_surface)."""
    return {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "messages": [
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": list(components),
                },
            },
        ],
    }
