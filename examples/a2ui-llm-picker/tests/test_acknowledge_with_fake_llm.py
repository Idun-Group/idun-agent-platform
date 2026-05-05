"""Acknowledge-node tests with patched LLM (no real Gemini calls)."""
from __future__ import annotations

import importlib.util as _u
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

_AGENT = (
    Path(__file__).resolve().parent.parent / "agent.py"
).resolve()
_spec = _u.spec_from_file_location("a2ui_llm_picker_agent", _AGENT)
_mod = _u.module_from_spec(_spec)
sys.modules["a2ui_llm_picker_agent"] = _mod
_spec.loader.exec_module(_mod)


def _state_with_action(name: str, *, destination: dict | None = None) -> dict:
    return {
        "messages": [],
        "idun": {
            "a2uiClientMessage": {
                "version": "v0.9",
                "action": {
                    "name": name,
                    "surfaceId": "travel_proposal",
                    "sourceComponentId": "opt0_btn",
                    "timestamp": "2026-05-05T00:00:00Z",
                    "context": destination or {
                        "id": "bali",
                        "name": "Bali, Indonesia",
                        "tagline": "Volcanoes, surf, and warm rice paddies.",
                    },
                },
            },
        },
    }


@pytest.mark.unit
@pytest.mark.asyncio
async def test_acknowledge_emits_surface_with_destination_name():
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=AIMessage(
        content=(
            "Bali sits between volcanic ridges and turquoise sea, with "
            "intricate rice terraces and warm humid air. Days move slowly. "
            "The food is brilliant. Surfers and yogis share the coves.\n\n"
            "Wake up in Ubud at sunrise. Cycle through Tegallalang. "
            "Lunch at a warung. Late afternoon at a Canggu beach club."
        ),
    ))
    emitted: list[dict] = []

    async def _stub_emit(**kwargs):
        emitted.append(kwargs)

    state = _state_with_action("pick_destination")
    config = {"configurable": {"thread_id": "t1"}}

    with patch.object(_mod, "_llm", return_value=fake_llm), \
         patch.object(_mod, "emit_surface", side_effect=_stub_emit):
        result = await _mod.acknowledge(state, config)

    assert emitted, "expected at least one emit_surface call"
    surface = emitted[0]
    fb = str(surface.get("fallback_text", ""))
    assert "Bali" in fb
    components = surface["components"]
    h_text = next(c for c in components if c.get("id") == "h")["text"]
    assert h_text == "Bali, Indonesia"
    paragraphs = [c for c in components if c.get("id", "").startswith("p")]
    assert len(paragraphs) == 2
    assert isinstance(result["messages"][0], AIMessage)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_acknowledge_with_no_action_returns_message():
    state = {"messages": []}  # no idun
    result = await _mod.acknowledge(state, {})
    assert "No destination" in result["messages"][0].content
