"""A2UI v0.9 envelope builders.

Pure functions. No I/O, no LangGraph imports. The dispatcher in
``helpers.py`` calls these and forwards the result to
``adispatch_custom_event``.
"""

from __future__ import annotations

from typing import Any

from idun_agent_engine.a2ui.actions import _server_to_client_validator

#: Default catalog URI for A2UI v0.9 Basic Catalog.
#: See https://a2ui.org/specification/v0_9/basic_catalog.json
BASIC_CATALOG_V09 = "https://a2ui.org/specification/v0_9/basic_catalog.json"


def _validate_messages(messages: list[dict[str, Any]]) -> None:
    """Validate each envelope message against server_to_client.json.

    The schema is per-message (one of createSurface, updateComponents,
    updateDataModel), so we iterate. Raises ValueError on the first
    schema error with the JSON Pointer path to the offending node.
    """
    validator = _server_to_client_validator()
    for i, msg in enumerate(messages):
        errors = list(validator.iter_errors(msg))
        if errors:
            err = errors[0]
            path = "/".join(str(p) for p in err.absolute_path)
            raise ValueError(
                f"a2ui envelope message {i} failed schema "
                f"validation at /{path}: {err.message}"
            )


def build_emit_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    send_data_model: bool = True,
) -> dict[str, Any]:
    """Build the A2UI v0.9 envelope for a ``createSurface`` + ``updateComponents``
    (+ optional ``updateDataModel``) sequence.

    The returned dict becomes ``CustomEvent.value`` once the dispatcher
    fires it through ``adispatch_custom_event``.

    When ``data`` is provided, an additional ``updateDataModel`` message
    is appended so input components can bind to JSON Pointer paths
    (``{"path": "/name"}``) and round-trip user edits through the local
    surface state. Without ``data``, inputs render but their values do
    not update on user interaction (the renderer has no target for
    ``setValue``).

    Validates the produced envelope against ``server_to_client.json``
    before returning. Raises ``ValueError`` on validation failure with
    the JSON Pointer path so authors see malformed components at agent
    side instead of silent placeholder rendering on the frontend.

    ``send_data_model`` defaults to ``True`` so the surface's dataModel
    is forwarded to the agent on every action click (powers form-submit
    flows in WS3).
    """
    create_surface: dict[str, Any] = {
        "surfaceId": surface_id,
        "catalogId": catalog_id,
        "sendDataModel": send_data_model,
    }
    messages: list[dict[str, Any]] = [
        {
            "version": "v0.9",
            "createSurface": create_surface,
        },
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": list(components),
            },
        },
    ]
    if data is not None:
        # A2UI v0.9 spec: updateDataModel uses ``value`` (with optional
        # ``path`` defaulting to ``/``) — not ``data``. Mismatched key
        # names would fail mandatory schema validation below.
        messages.append(
            {
                "version": "v0.9",
                "updateDataModel": {
                    "surfaceId": surface_id,
                    "value": dict(data),
                },
            }
        )
    envelope: dict[str, Any] = {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "messages": messages,
    }
    if fallback_text is not None:
        envelope["fallbackText"] = fallback_text
    if metadata is not None:
        envelope["metadata"] = dict(metadata)

    _validate_messages(messages)
    return envelope


def build_update_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the A2UI v0.9 envelope for an ``updateComponents``-only
    incremental update (after a prior emit_surface).

    Validates against ``server_to_client.json`` before returning.
    """
    messages: list[dict[str, Any]] = [
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": list(components),
            },
        },
    ]
    _validate_messages(messages)
    return {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "messages": messages,
    }
