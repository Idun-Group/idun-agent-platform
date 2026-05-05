"""End-to-end integration: forwardedProps.idun.a2uiClientMessage round-trips
to a LangGraph node via /agent/run, where read_a2ui_context returns a typed
A2UIContext.

Uses an inline LangGraph fixture (no external file) so the test is fully
self-contained and doesn't depend on the smoke-test agent. The inline graph
is injected by monkeypatching LanggraphAgent._load_graph_builder, which is
the actual loader entry point in the engine adapter.
"""

from __future__ import annotations

import json
from typing import Annotated, Any, TypedDict
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from idun_agent_engine.a2ui import read_a2ui_context
from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig


class _State(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    # ag-ui-langgraph spreads forwardedProps into the initial state via
    # ``{**forwarded_props, **payload_input}``. The top-level ``idun`` key
    # carries the A2UI action+dataModel payload and must be in the state
    # schema for LangGraph to route it through to the node.
    #
    # NOTE: adding extra state fields makes the engine's capability
    # discovery flip from ``chat`` to ``structured``. That only affects
    # /agent/run when the request also carries a ``messages`` array — and
    # the WS3 action contract is messages-empty, so the structured-input
    # JSON-validator in LanggraphAgent.run() short-circuits cleanly.
    idun: dict[str, Any]


async def _node(state: _State, config: RunnableConfig) -> _State:
    ctx = read_a2ui_context(state)
    if ctx is None:
        return {"messages": [AIMessage(content="text-mode")]}
    text = (
        f"got name={ctx.action.name} "
        f"src={ctx.action.source_component_id} "
        f"surface={ctx.action.surface_id}"
    )
    if ctx.data_model is not None:
        bound = ctx.data_for(ctx.action.surface_id) or {}
        text += f" data_keys={sorted(bound)}"
    return {"messages": [AIMessage(content=text)]}


def _build_graph_builder() -> StateGraph:
    """Return an UNCOMPILED StateGraph — engine recompiles with its own
    checkpointer (mirrors the contract _load_graph_builder enforces)."""
    builder = StateGraph(_State)
    builder.add_node("respond", _node)
    builder.set_entry_point("respond")
    builder.add_edge("respond", END)
    return builder


@pytest.fixture
def client(monkeypatch):
    """A FastAPI TestClient with an in-process LangGraph fixture."""
    cfg = EngineConfig.model_validate(
        {
            "server": {"api": {"port": 8080}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ws3-action-fixture",
                    "graph_definition": "tests/_inline_fixture.py:graph",
                    "checkpointer": {"type": "memory"},
                },
            },
        }
    )
    monkeypatch.setattr(
        LanggraphAgent,
        "_load_graph_builder",
        lambda self, _graph_definition: _build_graph_builder(),
    )
    app = create_app(engine_config=cfg)
    with TestClient(app) as test_client:
        yield test_client


def _post_run(
    client: TestClient,
    *,
    forwarded_props: dict | None,
    message: str | None,
):
    body: dict[str, Any] = {
        "threadId": str(uuid4()),
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


def _assistant_text(response) -> str:
    """Pull the final assistant message text out of the SSE stream."""
    final = ""
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            evt = json.loads(line[len("data:") :].strip())
        except json.JSONDecodeError:
            continue
        if evt.get("type") in ("MESSAGES_SNAPSHOT", "MessagesSnapshot"):
            msgs = evt.get("messages") or []
            for m in msgs:
                if (m.get("role") or "").lower() in ("assistant", "ai"):
                    final = str(m.get("content") or "")
        elif evt.get("type") in ("TEXT_MESSAGE_CONTENT", "TextMessageContent"):
            final += str(evt.get("delta") or "")
    return final


@pytest.mark.integration
class TestActionPassthrough:
    def test_run_with_action_lands_typed_at_node(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "submit_form",
                        "surfaceId": "s1",
                        "sourceComponentId": "btn_demo",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {},
                    },
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200
        text = _assistant_text(res)
        assert "got name=submit_form" in text
        assert "src=btn_demo" in text
        assert "surface=s1" in text

    def test_run_with_action_and_data_model(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "submit_form",
                        "surfaceId": "s1",
                        "sourceComponentId": "btn",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {},
                    },
                },
                "a2uiClientDataModel": {
                    "version": "v0.9",
                    "surfaces": {"s1": {"name": "alice", "agreed": True}},
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200
        text = _assistant_text(res)
        assert "data_keys=['agreed', 'name']" in text

    def test_run_without_idun_falls_through_to_text_mode(self, client):
        # message=None keeps ``messages: []`` so the engine's structured-input
        # JSON guard does not fire. The node must still produce ``text-mode``
        # because forwardedProps carries no ``idun`` envelope.
        res = _post_run(client, forwarded_props={}, message=None)
        assert res.status_code == 200
        assert "text-mode" in _assistant_text(res)

    def test_run_with_malformed_action_does_not_500(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {"name": "x"},  # missing required fields
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200, (
            f"expected 200 (soft-fail), got {res.status_code}: {res.text[:500]}"
        )
        assert "text-mode" in _assistant_text(res)

    def test_camel_case_nested_keys_preserved(self, client):
        # Ensures ag-ui-langgraph's snake_case-only-top-level rule didn't
        # rename a2uiClientMessage / surfaceId / sourceComponentId.
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "n",
                        "surfaceId": "S",
                        "sourceComponentId": "C",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {"camelKey": "preserved"},
                    },
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        text = _assistant_text(res)
        assert "src=C" in text
        assert "surface=S" in text
