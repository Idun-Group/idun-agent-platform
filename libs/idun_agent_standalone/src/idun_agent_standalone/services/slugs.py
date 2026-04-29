"""Slug normalization + uniqueness for collection resources.

Phase 5 collection routers call these helpers on POST. Singleton
resources (agent, memory) do not use slugs at the route level.
"""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

_MAX_SLUG_LEN = 64
_MAX_COLLISION_SUFFIX = 99
_NON_SLUG_CHAR = re.compile(r"[^a-z0-9]+")
_DASH_RUN = re.compile(r"-+")


class SlugNormalizationError(ValueError):
    """Raised when a name produces an empty slug after normalization."""


class SlugConflictError(Exception):
    """Raised when ensure_unique_slug exhausts its collision suffixes."""


def normalize_slug(name: str) -> str:
    """Normalize a resource name to a slug per spec.

    Pipeline:
      trim -> NFKD ascii-fold -> lowercase
      -> regex sub [^a-z0-9] -> "-"
      -> collapse runs of "-"
      -> trim leading/trailing "-"
      -> truncate to 64 chars

    Raises SlugNormalizationError if the result is empty.
    """
    trimmed = name.strip()
    folded = unicodedata.normalize("NFKD", trimmed)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    dashed = _NON_SLUG_CHAR.sub("-", lowered)
    collapsed = _DASH_RUN.sub("-", dashed)
    stripped = collapsed.strip("-")
    truncated = stripped[:_MAX_SLUG_LEN]
    if not truncated:
        raise SlugNormalizationError(f"Cannot derive a slug from name {name!r}")
    return truncated


async def ensure_unique_slug(
    session: AsyncSession,
    model_class: type,
    slug_column: InstrumentedAttribute,
    candidate: str,
) -> str:
    """Return candidate if unused; else suffix until unique.

    Tries candidate, candidate-2, candidate-3, ... up to candidate-99.
    Raises SlugConflictError after 99 collisions.
    """
    if not await _slug_exists(session, model_class, slug_column, candidate):
        return candidate
    for suffix in range(2, _MAX_COLLISION_SUFFIX + 1):
        candidate_with_suffix = f"{candidate}-{suffix}"
        if not await _slug_exists(
            session, model_class, slug_column, candidate_with_suffix
        ):
            return candidate_with_suffix
    raise SlugConflictError(
        f"Could not find a unique slug for {candidate!r} after "
        f"{_MAX_COLLISION_SUFFIX} attempts"
    )


async def _slug_exists(
    session: AsyncSession,
    model_class: type,
    slug_column: InstrumentedAttribute,
    candidate: str,
) -> bool:
    result: Result[tuple[object]] = await session.execute(
        select(model_class).where(slug_column == candidate).limit(1)
    )
    return result.scalar_one_or_none() is not None
