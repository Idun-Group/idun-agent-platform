"""Standalone prompt admin contracts.

Prompts are a collection with append-only versioning, mirroring
``idun_agent_schema.manager.managed_prompt``. There is **no slug** and
**no enabled** — every prompt version is part of the active config.

PATCH only accepts ``tags``. Content changes create a new version,
which is enforced at the DB / router layer in Phase 4+. The
``StandalonePromptPatch`` shape simply does not declare ``content`` so
client attempts to PATCH content fail at request validation (round 1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ._base import _CamelModel


class StandalonePromptRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_id: str
    version: int
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class StandalonePromptCreate(_CamelModel):
    """Body for POST /admin/api/v1/prompts.

    Creating a prompt with an existing ``prompt_id`` creates a new
    version at the DB layer (Phase 4+); the schema does not enforce
    uniqueness.
    """

    prompt_id: str
    content: str
    tags: list[str] = Field(default_factory=list)


class StandalonePromptPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/prompts/{id}.

    Only ``tags`` is patchable. Sending null on ``tags`` is rejected
    (clearing tags means an empty list, not null). Content changes are
    not accepted on PATCH — clients POST a new version instead.
    """

    tags: list[str] | None = None

    @model_validator(mode="after")
    def _no_null_tags(self) -> Self:
        if "tags" in self.model_fields_set and self.tags is None:
            raise ValueError("tags cannot be null; send [] for empty")
        return self
