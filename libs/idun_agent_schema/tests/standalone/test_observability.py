"""Tests for idun_agent_schema.standalone.observability."""

from __future__ import annotations

from datetime import UTC, datetime

from idun_agent_schema.standalone import (
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
    payload = {
        "observability": _sample_observability(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneObservabilityRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneObservabilityRead.model_validate(dumped)
    assert reparsed == parsed
    assert "observability" in dumped
    assert "updatedAt" in dumped


def test_observability_read_snake_case_inbound() -> None:
    payload = {
        "observability": _sample_observability(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneObservabilityRead.model_validate(payload)
    assert parsed.observability.provider.value == "LANGFUSE"


def test_observability_patch_accepts_partial() -> None:
    patch = StandaloneObservabilityPatch.model_validate(
        {"observability": _sample_observability()}
    )
    assert patch.observability is not None
    assert patch.observability.provider.value == "LANGFUSE"


def test_observability_patch_accepts_empty() -> None:
    patch = StandaloneObservabilityPatch.model_validate({})
    assert patch.observability is None
