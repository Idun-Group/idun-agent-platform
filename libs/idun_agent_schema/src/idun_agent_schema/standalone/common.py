"""Common models shared across standalone admin contracts."""

from __future__ import annotations

from typing import Generic, Literal, TypeVar
from uuid import UUID

from ._base import _CamelModel
from .reload import StandaloneReloadResult


class StandaloneResourceIdentity(_CamelModel):
    """Minimal identity payload for a standalone resource."""

    id: UUID
    slug: str | None = None
    name: str


class StandaloneDeleteResult(_CamelModel):
    """Body of a successful DELETE response, wrapped in StandaloneMutationResponse."""

    id: UUID
    deleted: Literal[True] = True


class StandaloneSingletonDeleteResult(_CamelModel):
    """Body of a DELETE response for a singleton resource.

    Singleton resources (memory, future ones) are addressed by route
    instead of by id, so the response carries only the deletion flag.
    """

    deleted: Literal[True] = True


T = TypeVar("T")


class StandaloneMutationResponse(_CamelModel, Generic[T]):
    """Envelope returned by every successful admin mutation."""

    data: T
    reload: StandaloneReloadResult
