"""A2UI v0.9 client→server action ingest.

Pydantic mirrors of A2UI's client_to_server.json + client_data_model.json
schemas so agent code reads native A2UI types. Validation against the
canonical JSON Schemas is layered on top in this module's read_a2ui_context
(see Task 4).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from functools import cache
from importlib.resources import files
from typing import Any, Literal

from jsonschema import Draft202012Validator
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

log = logging.getLogger(__name__)


# a2ui-agent-sdk 0.2.1 ships v0.9 JSON Schemas under a2ui/assets/0.9/.
# Only server→client schemas are bundled (server_to_client.json,
# common_types.json, basic_catalog.json). The SDK's own design treats
# client→server messages as Pydantic/Zod-validated, so we mirror that:
# outbound validation goes through the validator below; inbound uses the
# Pydantic models in this module.
_A2UI_SCHEMA_DIR = files("a2ui").joinpath("assets/0.9")


def _load_schema(filename: str) -> dict[str, Any]:
    return json.loads(_A2UI_SCHEMA_DIR.joinpath(filename).read_text())


@cache
def _server_to_client_validator() -> Draft202012Validator:
    """Validator for v0.9 server→client envelopes (createSurface,
    updateComponents, updateDataModel).

    Resolves $refs transitively through catalog.json (loaded from
    basic_catalog.json on disk) and common_types.json:
      server_to_client.json  →  catalog.json#/$defs/anyComponent, theme
      catalog.json           →  common_types.json#/$defs/{DynamicString, ...}
      common_types.json      →  catalog.json#/$defs/anyFunction
    Both must be in the registry for transitive resolution to land.

    Uses referencing.Registry rather than the deprecated RefResolver.
    RefResolver fails on this schema set with PointerToNowhere errors when
    a resolved cross-document fragment (e.g. catalog → #/components/Text)
    is dereferenced — the scope stack does not push the catalog as the
    new base, so the second hop is looked up in the original document.
    """
    s2c = _load_schema("server_to_client.json")
    catalog = _load_schema("basic_catalog.json")
    common = _load_schema("common_types.json")
    registry: Registry = Registry().with_resources(
        [
            (
                "https://a2ui.org/specification/v0_9/catalog.json",
                Resource(contents=catalog, specification=DRAFT202012),
            ),
            (
                "https://a2ui.org/specification/v0_9/common_types.json",
                Resource(contents=common, specification=DRAFT202012),
            ),
        ]
    )
    return Draft202012Validator(s2c, registry=registry)


class A2UIClientAction(BaseModel):
    """Mirrors specification/v0_9/json/client_to_server.json#/properties/action."""

    name: str
    surface_id: str = Field(alias="surfaceId")
    source_component_id: str = Field(alias="sourceComponentId")
    timestamp: str
    context: dict[str, Any]

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class A2UIClientMessage(BaseModel):
    """Envelope wrapper for the action variant of client_to_server.json."""

    version: Literal["v0.9"]
    action: A2UIClientAction

    model_config = ConfigDict(extra="forbid")


class A2UIClientDataModel(BaseModel):
    """Mirrors specification/v0_9/json/client_data_model.json."""

    version: Literal["v0.9"]
    surfaces: dict[str, dict[str, Any]]

    model_config = ConfigDict(extra="forbid")


class A2UIContext(BaseModel):
    """Bundle of an A2UI action plus the surfaces' dataModel snapshot."""

    action: A2UIClientAction
    data_model: A2UIClientDataModel | None = None

    def data_for(self, surface_id: str) -> dict[str, Any] | None:
        """Return the bound dataModel dict for a surface, or None if absent."""
        if self.data_model is None:
            return None
        return self.data_model.surfaces.get(surface_id)


def read_a2ui_context(state: Mapping[str, Any]) -> A2UIContext | None:
    """Read + Pydantic-validate + box the A2UI action+dataModel from state.

    ag-ui-langgraph spreads the request's ``forwarded_props`` into the
    initial LangGraph input via ``stream_input = {**forwarded_props,
    **payload_input}`` (see ag_ui_langgraph/agent.py:540), so
    ``state["idun"]["a2uiClientMessage"]`` and (optionally)
    ``state["idun"]["a2uiClientDataModel"]`` are visible to nodes.

    Validation is mandatory and Pydantic-backed (the SDK does not ship
    JSON Schemas for client→server messages, matching its own design).
    Pydantic models use ``extra="forbid"`` so malformed payloads fail
    loudly. Soft-fails to None on missing or malformed payload (logs a
    WARNING). Text-mode turns (no idun.a2uiClientMessage) return None
    silently — designed so a frontend bug in the action path can never
    crash a text-mode turn.
    """
    if not isinstance(state, Mapping):
        return None
    idun = state.get("idun")
    if not isinstance(idun, Mapping):
        return None
    raw_msg = idun.get("a2uiClientMessage")
    raw_dm = idun.get("a2uiClientDataModel")
    if raw_msg is None:
        return None

    try:
        msg = A2UIClientMessage.model_validate(raw_msg)
        dm = (
            A2UIClientDataModel.model_validate(raw_dm)
            if raw_dm is not None
            else None
        )
    except ValidationError as e:
        log.warning("a2ui payload failed validation: %s", e)
        return None
    return A2UIContext(action=msg.action, data_model=dm)
