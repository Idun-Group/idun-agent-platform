"""Tests for idun_agent_schema.standalone.integrations."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneIntegrationCreate,
    StandaloneIntegrationPatch,
    StandaloneIntegrationRead,
)


def _sample_integration() -> dict:
    return {
        "provider": "WHATSAPP",
        "enabled": True,
        "config": {
            "access_token": "atk-x",
            "phone_number_id": "pn-1",
            "verify_token": "vt-1",
        },
    }


def test_integration_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "whatsapp",
        "name": "WhatsApp",
        "enabled": True,
        "integration": _sample_integration(),
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneIntegrationRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneIntegrationRead.model_validate(dumped)
    assert reparsed == parsed


def test_integration_create_default_enabled_true() -> None:
    payload = {"name": "WhatsApp", "integration": _sample_integration()}
    parsed = StandaloneIntegrationCreate.model_validate(payload)
    assert parsed.enabled is True


def test_integration_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneIntegrationPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)
