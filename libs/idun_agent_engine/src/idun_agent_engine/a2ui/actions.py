"""A2UI v0.9 client→server action ingest.

Pydantic mirrors of A2UI's client_to_server.json + client_data_model.json
schemas so agent code reads native A2UI types. Validation against the
canonical JSON Schemas is layered on top in this module's read_a2ui_context
(see Task 4).
"""

from __future__ import annotations

import json
import logging
from functools import cache
from importlib.resources import files
from typing import Any, Literal

from jsonschema import Draft202012Validator
from jsonschema.validators import RefResolver
from pydantic import BaseModel, ConfigDict, Field

log = logging.getLogger(__name__)


# a2ui-agent-sdk 0.2.1 ships v0.9 JSON Schemas under a2ui/assets/0.9/.
# Only server→client schemas are bundled (server_to_client.json,
# common_types.json, basic_catalog.json). The SDK's own design treats
# client→server messages as Pydantic/Zod-validated, so we mirror that:
# outbound validation goes through the validator below; inbound uses the
# Pydantic models in this module.
_A2UI_SCHEMA_DIR = files("a2ui").joinpath("assets/0.9")


def _load_schema(filename: str) -> dict:
    return json.loads(_A2UI_SCHEMA_DIR.joinpath(filename).read_text())


@cache
def _server_to_client_validator() -> Draft202012Validator:
    """Validator for v0.9 server→client envelopes (createSurface,
    updateComponents, updateDataModel). Resolves $ref to common_types."""
    s2c = _load_schema("server_to_client.json")
    common = _load_schema("common_types.json")
    resolver = RefResolver.from_schema(
        s2c, store={"common_types.json": common},
    )
    return Draft202012Validator(s2c, resolver=resolver)


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
