"""Unit tests for the A2UI envelope builder.

The envelope builder is pure-function and shape-only. Tests pin the
exact JSON shape that ``ag-ui-langgraph`` will see as ``CustomEvent.value``.
"""

from __future__ import annotations

import pytest

from idun_agent_engine.a2ui.envelope import (
    BASIC_CATALOG_V09,
    build_emit_envelope,
    build_update_envelope,
)


@pytest.mark.unit
class TestBuildEmitEnvelope:
    """Tests for the create_surface + update_components envelope."""

    def test_basic_shape(self) -> None:
        envelope = build_emit_envelope(
            surface_id="search_results",
            components=[{"id": "root", "component": "Text", "text": "hi"}],
        )
        assert envelope == {
            "a2uiVersion": "v0.9",
            "surfaceId": "search_results",
            "messages": [
                {
                    "version": "v0.9",
                    "createSurface": {
                        "surfaceId": "search_results",
                        "catalogId": BASIC_CATALOG_V09,
                    },
                },
                {
                    "version": "v0.9",
                    "updateComponents": {
                        "surfaceId": "search_results",
                        "components": [
                            {"id": "root", "component": "Text", "text": "hi"}
                        ],
                    },
                },
            ],
        }

    def test_includes_fallback_text_when_provided(self) -> None:
        envelope = build_emit_envelope(
            surface_id="s",
            components=[],
            fallback_text="3 results found",
        )
        assert envelope["fallbackText"] == "3 results found"

    def test_omits_fallback_text_when_none(self) -> None:
        envelope = build_emit_envelope(surface_id="s", components=[])
        assert "fallbackText" not in envelope

    def test_includes_metadata_when_provided(self) -> None:
        envelope = build_emit_envelope(
            surface_id="s",
            components=[],
            metadata={"source": "tool", "tool_name": "search"},
        )
        assert envelope["metadata"] == {
            "source": "tool",
            "tool_name": "search",
        }

    def test_omits_metadata_when_none(self) -> None:
        envelope = build_emit_envelope(surface_id="s", components=[])
        assert "metadata" not in envelope

    def test_custom_catalog_id_overrides_default(self) -> None:
        envelope = build_emit_envelope(
            surface_id="s",
            components=[],
            catalog_id="https://idun-example.com/catalogs/v1.json",
        )
        create_msg = envelope["messages"][0]["createSurface"]
        assert create_msg["catalogId"] == "https://idun-example.com/catalogs/v1.json"


@pytest.mark.unit
class TestBuildUpdateEnvelope:
    """Tests for the updateComponents-only envelope."""

    def test_basic_shape(self) -> None:
        envelope = build_update_envelope(
            surface_id="search_results",
            components=[{"id": "row-1", "component": "Text", "text": "new row"}],
        )
        assert envelope == {
            "a2uiVersion": "v0.9",
            "surfaceId": "search_results",
            "messages": [
                {
                    "version": "v0.9",
                    "updateComponents": {
                        "surfaceId": "search_results",
                        "components": [
                            {"id": "row-1", "component": "Text", "text": "new row"}
                        ],
                    },
                },
            ],
        }

    def test_no_create_surface(self) -> None:
        envelope = build_update_envelope(surface_id="s", components=[])
        assert all(
            "createSurface" not in msg for msg in envelope["messages"]
        )

    def test_no_fallback_text_field(self) -> None:
        envelope = build_update_envelope(surface_id="s", components=[])
        assert "fallbackText" not in envelope


@pytest.mark.unit
def test_basic_catalog_v09_constant() -> None:
    """The basic catalog URI is the v0.9 spec URL — pin it explicitly
    so a future bump changes both this constant and any clients that
    care about the exact value."""
    assert BASIC_CATALOG_V09 == (
        "https://a2ui.org/specification/v0_9/basic_catalog.json"
    )
