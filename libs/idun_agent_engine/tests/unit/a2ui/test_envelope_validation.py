"""Mandatory JSON Schema validation tests for build_emit/update_envelope.

WS3 retrofit: every envelope produced by these builders is validated
against A2UI v0.9's server_to_client.json before returning. Malformed
envelopes raise ValueError with the JSON-Schema error path.
"""
from __future__ import annotations

import pytest

from idun_agent_engine.a2ui.envelope import (
    build_emit_envelope,
    build_update_envelope,
)


def _basic_components() -> list[dict]:
    return [
        {"id": "title", "component": "Text", "text": "Hi"},
        {"id": "root", "component": "Card", "child": "title"},
    ]


@pytest.mark.unit
class TestBuildEmitEnvelopeValidation:
    def test_happy_path_validates(self) -> None:
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
        )
        # No exception means validation passed.
        assert "messages" in env
        assert env["surfaceId"] == "s1"

    def test_typo_component_key_raises(self) -> None:
        bad = [
            {"id": "title", "compoonent": "Text", "text": "Hi"},  # typo
            {"id": "root", "component": "Card", "child": "title"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_emit_envelope(surface_id="s1", components=bad)

    def test_unknown_component_type_raises(self) -> None:
        bad = [
            {"id": "x", "component": "TableThatDoesntExist"},
            {"id": "root", "component": "Card", "child": "x"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_emit_envelope(surface_id="s1", components=bad)

    def test_send_data_model_default_true(self) -> None:
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
        )
        # Find the createSurface message and assert sendDataModel true.
        create_msg = next(
            m for m in env["messages"] if "createSurface" in m
        )
        assert create_msg["createSurface"]["sendDataModel"] is True

    def test_send_data_model_can_be_disabled(self) -> None:
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
            send_data_model=False,
        )
        create_msg = next(
            m for m in env["messages"] if "createSurface" in m
        )
        assert create_msg["createSurface"]["sendDataModel"] is False


@pytest.mark.unit
class TestBuildUpdateEnvelopeValidation:
    def test_happy_path_validates(self) -> None:
        env = build_update_envelope(
            surface_id="s1", components=_basic_components(),
        )
        assert "messages" in env

    def test_invalid_components_raise(self) -> None:
        bad = [
            {"id": "x", "component": "NotARealComponent"},
            {"id": "root", "component": "Card", "child": "x"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_update_envelope(surface_id="s1", components=bad)
