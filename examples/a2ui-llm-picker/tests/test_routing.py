"""_route_entry tests for the LLM travel-picker.

Routing rules:
  - no idun key                                                 -> propose
  - idun.a2uiClientMessage.action.name == 'ask_again'           -> propose
  - idun.a2uiClientMessage.action.name == 'pick_destination'    -> acknowledge
  - any other action.name                                       -> acknowledge (fall-through)
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


def _state(action_name: str | None) -> dict:
    if action_name is None:
        return {"messages": []}
    return {
        "messages": [],
        "idun": {
            "a2uiClientMessage": {
                "version": "v0.9",
                "action": {
                    "name": action_name,
                    "surfaceId": "x", "sourceComponentId": "y",
                    "timestamp": "2026-05-05T00:00:00Z", "context": {},
                },
            },
        },
    }


@pytest.mark.unit
@pytest.mark.parametrize("action,expected", [
    (None,                "propose"),
    ("ask_again",         "propose"),
    ("pick_destination",  "acknowledge"),
    ("unknown_event",     "acknowledge"),
])
def test_route_entry(action, expected):
    assert _mod._route_entry(_state(action)) == expected
