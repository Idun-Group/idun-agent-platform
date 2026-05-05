"""Unit tests for the A2UI travel-picker proposal-surface helper.

No LLM calls — the helper is pure and consumes a TravelProposal.
"""
from __future__ import annotations

import importlib.util as _u
import sys
from pathlib import Path

import pytest

_AGENT = (
    Path(__file__).resolve().parent.parent / "agent.py"
).resolve()
_spec = _u.spec_from_file_location("a2ui_llm_picker_agent", _AGENT)
_mod = _u.module_from_spec(_spec)
sys.modules["a2ui_llm_picker_agent"] = _mod
_spec.loader.exec_module(_mod)


@pytest.mark.unit
def test_proposal_surface_components_validates_against_basic_catalog():
    from idun_agent_engine.a2ui.actions import _server_to_client_validator

    proposal = _mod.TravelProposal(
        intro="Three destinations for warm-beach lovers.",
        options=[
            _mod.TravelOption(id="bali", name="Bali, Indonesia",
                              tagline="Volcanoes, surf, and warm rice paddies."),
            _mod.TravelOption(id="zanzibar", name="Zanzibar, Tanzania",
                              tagline="Spice-island markets and turquoise water."),
            _mod.TravelOption(id="palawan", name="Palawan, Philippines",
                              tagline="Limestone karsts rising out of glassy seas."),
        ],
    )
    components = _mod._proposal_surface_components(proposal)

    # Build a synthetic envelope so we can run it through validation.
    msg = {
        "version": "v0.9",
        "updateComponents": {
            "surfaceId": "travel_proposal",
            "components": components,
        },
    }
    errors = list(_server_to_client_validator().iter_errors(msg))
    assert errors == [], f"unexpected schema errors: {[e.message for e in errors]}"


@pytest.mark.unit
def test_proposal_surface_components_emits_three_pick_buttons():
    proposal = _mod.TravelProposal(
        intro="x",
        options=[
            _mod.TravelOption(id=f"opt{i}", name=f"Opt {i}", tagline="ok ok ok ok ok ok ok ok")
            for i in range(3)
        ],
    )
    components = _mod._proposal_surface_components(proposal)

    buttons = [
        c for c in components
        if c.get("component") == "Button" and "action" in c
    ]
    assert len(buttons) == 3
    for i, btn in enumerate(buttons):
        evt = btn["action"]["event"]
        assert evt["name"] == "pick_destination"
        # A2UI v0.9 DynamicValue forbids object literals in context, so
        # the helper flattens the destination payload to scalar fields.
        assert evt["context"]["id"] == f"opt{i}"
        assert evt["context"]["name"] == f"Opt {i}"


@pytest.mark.unit
def test_proposal_surface_includes_root_column():
    proposal = _mod.TravelProposal(
        intro="x",
        options=[
            _mod.TravelOption(id="a", name="A", tagline="aaaaaaaa aaaaaaaa")
            for _ in range(3)
        ],
    )
    components = _mod._proposal_surface_components(proposal)
    root = next(c for c in components if c.get("id") == "root")
    assert root["component"] == "Column"
    assert "intro" in root["children"]
