"""Tests for the slugs service."""

from __future__ import annotations

import pytest
from idun_agent_standalone.infrastructure.db.session import Base
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)
from sqlalchemy import Column, String

# normalize_slug tests


def test_normalize_simple_name() -> None:
    assert normalize_slug("GitHub Tools") == "github-tools"


def test_normalize_strips_special_chars() -> None:
    assert normalize_slug("Hello, World! @ Idun") == "hello-world-idun"


def test_normalize_collapses_runs() -> None:
    assert normalize_slug("foo--bar---baz") == "foo-bar-baz"


def test_normalize_trims_dashes() -> None:
    assert normalize_slug("---foo---") == "foo"


def test_normalize_truncates_to_64_chars() -> None:
    long_name = "a" * 200
    result = normalize_slug(long_name)
    assert len(result) == 64
    assert result == "a" * 64


def test_normalize_unicode_ascii_fold() -> None:
    assert normalize_slug("Café Münster") == "cafe-munster"


def test_normalize_lowercase() -> None:
    assert normalize_slug("FooBar") == "foobar"


def test_normalize_empty_raises() -> None:
    with pytest.raises(SlugNormalizationError):
        normalize_slug("")


def test_normalize_only_special_raises() -> None:
    with pytest.raises(SlugNormalizationError):
        normalize_slug("!!!@@@")


def test_normalize_leading_trailing_whitespace() -> None:
    assert normalize_slug("  github tools  ") == "github-tools"


# ensure_unique_slug tests
# We need a small ORM model to test against.

class _FakeRow(Base):
    __tablename__ = "_fake_slug_test"
    id: str = Column(String(36), primary_key=True)  # type: ignore[assignment]
    slug: str = Column(String(64), nullable=False, unique=True)  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_ensure_unique_no_collision(async_session) -> None:
    result = await ensure_unique_slug(
        async_session, _FakeRow, _FakeRow.slug, "fresh"
    )
    assert result == "fresh"


@pytest.mark.asyncio
async def test_ensure_unique_one_collision(async_session) -> None:
    async_session.add(_FakeRow(id="1", slug="github-tools"))
    await async_session.flush()
    result = await ensure_unique_slug(
        async_session, _FakeRow, _FakeRow.slug, "github-tools"
    )
    assert result == "github-tools-2"


@pytest.mark.asyncio
async def test_ensure_unique_99_collisions_raises(async_session) -> None:
    """Defensive upper bound — should be impossible in practice."""
    async_session.add(_FakeRow(id="0", slug="a"))
    for n in range(2, 100):
        async_session.add(_FakeRow(id=str(n), slug=f"a-{n}"))
    await async_session.flush()
    with pytest.raises(SlugConflictError):
        await ensure_unique_slug(async_session, _FakeRow, _FakeRow.slug, "a")
