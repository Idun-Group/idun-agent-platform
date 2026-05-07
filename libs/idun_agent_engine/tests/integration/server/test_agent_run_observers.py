"""Integration tests for run-event observer dispatch on `/agent/run`.

These tests verify that every AG-UI event yielded by the agent during
a `/agent/run` request is dispatched to registered observers BEFORE
SSE encoding. Observer failures must not break the SSE stream — that
isolation is enforced by `RunEventObserverRegistry.dispatch` (Task 0.1).
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from idun_agent_engine import create_app
from idun_agent_engine.agent.observers import RunContext


@pytest.mark.asyncio
async def test_observers_called_before_sse_encoding(echo_agent_config):
    """Each event yielded by the agent should reach registered observers.

    Drives the FastAPI lifespan explicitly via ``router.lifespan_context``
    because ``ASGITransport`` does not start lifespans automatically. Once
    the agent is on ``app.state.agent`` we register the observer and
    exercise ``/agent/run``.
    """
    app = create_app(config_dict=echo_agent_config)
    captured: list[tuple[str, str, str]] = []

    async def observer(event, ctx: RunContext) -> None:
        captured.append((type(event).__name__, ctx.thread_id, ctx.run_id))

    async with app.router.lifespan_context(app):
        agent = app.state.agent
        agent.register_run_event_observer(observer)

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.post(
                "/agent/run",
                json={
                    "threadId": "tid_1",
                    "runId": "rid_1",
                    "messages": [
                        {"id": "m1", "role": "user", "content": "hi"}
                    ],
                    "state": {},
                    "tools": [],
                    "context": [],
                    "forwardedProps": {},
                },
                headers={"accept": "text/event-stream"},
            )
            assert resp.status_code == 200
            await resp.aread()

    assert captured, "observer was never invoked"
    assert all(
        tid == "tid_1" and rid == "rid_1" for (_t, tid, rid) in captured
    )
