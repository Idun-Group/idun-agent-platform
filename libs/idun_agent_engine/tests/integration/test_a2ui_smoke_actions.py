"""Integration tests for the smoke-agent's three action flavors.

Loads the smoke agent's compiled graph directly (the same graph the
engine would resolve via graph_definition) and drives it through the
engine's /agent/run handler with each action's wire payload.
"""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig

_AGENT_PATH = (
    Path(__file__).parent.parent.parent.parent.parent
    / "examples"
    / "a2ui-smoke"
    / "agent.py"
).resolve()


def _load_graph():
    import importlib.util as u

    spec = u.spec_from_file_location("a2ui_smoke_agent", _AGENT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {_AGENT_PATH}")
    mod = u.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.graph


@pytest.fixture
def client(monkeypatch):
    """Engine TestClient with the smoke agent's compiled graph injected."""
    graph = _load_graph()
    cfg = EngineConfig.model_validate(
        {
            "server": {"api": {"port": 8080}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "smoke-actions-fixture",
                    "graph_definition": "tests/_inline_fixture.py:graph",
                    "checkpointer": {"type": "memory"},
                },
            },
        }
    )
    # _load_graph_builder must return an uncompiled StateGraph; the smoke
    # agent module exposes a CompiledStateGraph, so we hand back its
    # `.builder` (the engine's loader does exactly the same when given a
    # compiled graph — see LanggraphAgent._load_graph_builder).
    monkeypatch.setattr(
        LanggraphAgent,
        "_load_graph_builder",
        lambda self, _graph_definition: graph.builder,
    )
    app = create_app(engine_config=cfg)
    with TestClient(app) as test_client:
        yield test_client


def _post_run(client, *, forwarded_props=None, message=None, thread_id=None):
    body = {
        "threadId": thread_id or str(uuid4()),
        "runId": str(uuid4()),
        "messages": (
            [{"id": "u1", "role": "user", "content": message}] if message else []
        ),
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": forwarded_props or {},
    }
    return client.post(
        "/agent/run",
        json=body,
        headers={"accept": "text/event-stream"},
    )


def _custom_events(response):
    """Yield parsed CUSTOM idun.a2ui.messages event values from the SSE stream."""
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            evt = json.loads(line[len("data:") :].strip())
        except json.JSONDecodeError:
            continue
        if (
            evt.get("type") in ("CUSTOM", "CustomEvent")
            and evt.get("name") == "idun.a2ui.messages"
        ):
            yield evt.get("value")


def _action_msg(name, *, surface_id="a2ui_showcase", source="src", context=None):
    return {
        "version": "v0.9",
        "action": {
            "name": name,
            "surfaceId": surface_id,
            "sourceComponentId": source,
            "timestamp": "2026-05-05T00:00:00Z",
            "context": context or {},
        },
    }


@pytest.mark.integration
class TestSmokeActions:
    def test_initial_turn_emits_showcase(self, client):
        # No forwardedProps.idun → router falls through to respond(),
        # which emits the showcase. message=None keeps `messages: []` so
        # the engine's structured-input JSON guard does not fire (the
        # smoke State exposes `idun` which flips capability to
        # structured, mirroring the T7 setup).
        res = _post_run(client, message=None)
        assert res.status_code == 200
        events = list(_custom_events(res))
        assert events, "expected at least one CUSTOM idun.a2ui.messages event"
        ids = [e.get("surfaceId") for e in events]
        assert "a2ui_showcase" in ids

    def test_submit_form_emits_confirmation(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": _action_msg("submit_form"),
                "a2uiClientDataModel": {
                    "version": "v0.9",
                    "surfaces": {
                        "a2ui_showcase": {
                            "name": "alice",
                            "agreed": True,
                            "color": "blue",
                            "volume": 50,
                            "when": "2026-06-01T09:00:00Z",
                        }
                    },
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert "submit_confirmation" in ids
        # Walk the confirmation envelope and find the Name text.
        conf = next(e for e in events if e.get("surfaceId") == "submit_confirmation")
        update = next(
            m["updateComponents"]["components"]
            for m in conf["messages"]
            if "updateComponents" in m
        )
        name_text = next(c["text"] for c in update if c.get("id") == "f_name")
        assert "Name: alice" in name_text

    def test_reset_re_emits_showcase(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": _action_msg(
                    "reset", surface_id="submit_confirmation"
                ),
            },
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert "a2ui_showcase" in ids

    @pytest.mark.parametrize(
        "opt,letter",
        [
            ("option_a", "A"),
            ("option_b", "B"),
            ("option_c", "C"),
        ],
    )
    def test_branching_menu(self, client, opt, letter):
        forwarded = {
            "idun": {
                "a2uiClientMessage": _action_msg(opt, source=f"btn_{opt[-1]}"),
            },
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert f"branch_{opt}" in ids
        env = next(e for e in events if e.get("surfaceId") == f"branch_{opt}")
        update = next(
            m["updateComponents"]["components"]
            for m in env["messages"]
            if "updateComponents" in m
        )
        h_text = next(c["text"] for c in update if c.get("id") == "h")
        assert f"Option {letter} picked" == h_text
