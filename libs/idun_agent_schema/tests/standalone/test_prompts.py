"""Tests for idun_agent_schema.standalone.prompts."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandalonePromptCreate,
    StandalonePromptPatch,
    StandalonePromptRead,
)


def test_prompt_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "promptId": "system-prompt",
        "version": 1,
        "content": "You are an Idun agent.",
        "tags": ["latest"],
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandalonePromptRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandalonePromptRead.model_validate(dumped)
    assert reparsed == parsed
    assert "promptId" in dumped


def test_prompt_create_defaults_tags_to_empty_list() -> None:
    parsed = StandalonePromptCreate.model_validate(
        {"promptId": "system-prompt", "content": "You are an Idun agent."}
    )
    assert parsed.tags == []


def test_prompt_patch_accepts_tags_only() -> None:
    parsed = StandalonePromptPatch.model_validate({"tags": ["latest", "draft"]})
    assert parsed.tags == ["latest", "draft"]


def test_prompt_patch_drops_unknown_content_field() -> None:
    """PATCH does not declare content; Pydantic silently drops it."""

    parsed = StandalonePromptPatch.model_validate(
        {"tags": ["latest"], "content": "ignored"}
    )
    dumped = parsed.model_dump(exclude_none=True)
    assert dumped == {"tags": ["latest"]}


def test_prompt_patch_explicit_null_tags_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandalonePromptPatch.model_validate({"tags": None})
    assert "tags cannot be null" in str(exc_info.value)


def test_prompt_patch_empty_tags_list_accepts() -> None:
    parsed = StandalonePromptPatch.model_validate({"tags": []})
    assert parsed.tags == []
