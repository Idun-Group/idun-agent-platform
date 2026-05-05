"""Tests for idun_agent_schema.standalone.guardrails."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneGuardrailCreate,
    StandaloneGuardrailPatch,
    StandaloneGuardrailRead,
)


def _sample_manager_guardrail() -> dict:
    """Manager-shape SimpleBanListConfig payload."""

    return {
        "config_id": "ban_list",
        "banned_words": ["badword"],
    }


def test_guardrail_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ban-secrets",
        "name": "Ban secrets",
        "enabled": True,
        "position": "input",
        "sortOrder": 0,
        "guardrail": _sample_manager_guardrail(),
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneGuardrailRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneGuardrailRead.model_validate(dumped)
    assert reparsed == parsed
    assert "sortOrder" in dumped
    assert "createdAt" in dumped


def test_guardrail_create_default_enabled_true() -> None:
    payload = {
        "name": "Ban secrets",
        "position": "input",
        "guardrail": _sample_manager_guardrail(),
    }
    parsed = StandaloneGuardrailCreate.model_validate(payload)
    assert parsed.enabled is True
    assert parsed.sort_order == 0


def test_guardrail_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneGuardrailPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_guardrail_patch_position_invalid_value() -> None:
    with pytest.raises(ValidationError):
        StandaloneGuardrailPatch.model_validate({"position": "middle"})


def test_guardrail_create_negative_sort_order_rejects() -> None:
    """sort_order has Field(ge=0) — negative values fail at round 1."""

    payload = {
        "name": "Ban secrets",
        "position": "input",
        "sortOrder": -1,
        "guardrail": _sample_manager_guardrail(),
    }
    with pytest.raises(ValidationError):
        StandaloneGuardrailCreate.model_validate(payload)
