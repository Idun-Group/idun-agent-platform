"""Tests for idun_agent_schema.standalone.observability."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneObservabilityCreate,
    StandaloneObservabilityPatch,
    StandaloneObservabilityRead,
)


def _sample_observability() -> dict:
    return {
        "provider": "LANGFUSE",
        "enabled": True,
        "config": {
            "public_key": "pk-x",
            "secret_key": "sk-x",
            "host": "https://cloud.langfuse.com",
        },
    }


def test_observability_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "langfuse",
        "name": "Langfuse",
        "enabled": True,
        "observability": _sample_observability(),
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneObservabilityRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneObservabilityRead.model_validate(dumped)
    assert reparsed == parsed
    assert "observability" in dumped


def test_observability_create_default_enabled_true() -> None:
    payload = {"name": "Langfuse", "observability": _sample_observability()}
    parsed = StandaloneObservabilityCreate.model_validate(payload)
    assert parsed.enabled is True


def test_observability_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneObservabilityPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)
