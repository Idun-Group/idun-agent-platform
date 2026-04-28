"""Standalone guardrail admin contracts.

Guardrails are a collection in standalone (one row per attached guard).
Routes use {id} for canonical lookup. The stored shape is manager-shape
(``ManagerGuardrailConfig``), and the manager's ``convert_guardrail`` is
reused at assembly time to translate to the engine guardrail shape.

The standalone row folds the manager M:N junction columns (``position``,
``sort_order``) into the row-level shape because standalone has one
agent and no junction tables.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from idun_agent_schema.manager.guardrail_configs import ManagerGuardrailConfig

from ._base import _CamelModel


class StandaloneGuardrailRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    position: Literal["input", "output"]
    sort_order: int = Field(ge=0)
    guardrail: ManagerGuardrailConfig
    created_at: datetime
    updated_at: datetime


class StandaloneGuardrailCreate(_CamelModel):
    """Body for POST /admin/api/v1/guardrails."""

    name: str
    enabled: bool = True
    position: Literal["input", "output"]
    sort_order: int = Field(default=0, ge=0)
    guardrail: ManagerGuardrailConfig


class StandaloneGuardrailPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/guardrails/{id}.

    All fields are optional; absence means no change. Sending null on
    ``name`` is rejected (clearing the row name is meaningless).
    """

    name: str | None = None
    enabled: bool | None = None
    position: Literal["input", "output"] | None = None
    sort_order: int | None = Field(default=None, ge=0)
    guardrail: ManagerGuardrailConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
