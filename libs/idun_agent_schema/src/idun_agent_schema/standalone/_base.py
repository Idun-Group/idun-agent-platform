"""Shared Pydantic base class for the standalone admin namespace.

Every public model in this namespace inherits from ``_CamelModel`` so
the wire format is camelCase by default, matching the frontend
convention locked in the standalone admin design.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """Base class with camelCase aliases and snake_case input fallback."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
