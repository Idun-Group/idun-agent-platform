"""A2UI v0.9 client→server action ingest.

Pydantic mirrors of A2UI's client_to_server.json + client_data_model.json
schemas so agent code reads native A2UI types. Validation against the
canonical JSON Schemas is layered on top in this module's read_a2ui_context
(see Task 4).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


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
