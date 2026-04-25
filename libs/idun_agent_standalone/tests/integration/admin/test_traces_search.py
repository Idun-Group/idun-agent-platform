"""Integration tests for the traces ?search= LIKE filter (spec §4.7, A8)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.db.models import SessionRow, TraceEventRow


@pytest.mark.asyncio
async def test_search_filters_events_by_payload_text(standalone_app):
    app, sm = standalone_app
    async with sm() as s:
        s.add(SessionRow(id="sess-search", message_count=2))
        s.add(
            TraceEventRow(
                session_id="sess-search",
                run_id="r1",
                sequence=0,
                event_type="TextMessageContent",
                payload={"text": "hello world"},
            )
        )
        s.add(
            TraceEventRow(
                session_id="sess-search",
                run_id="r1",
                sequence=1,
                event_type="TextMessageContent",
                payload={"text": "goodbye moon"},
            )
        )
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        all_events = await c.get(
            "/admin/api/v1/traces/sessions/sess-search/events"
        )
        assert all_events.status_code == 200
        assert len(all_events.json()["events"]) == 2

        only_hello = await c.get(
            "/admin/api/v1/traces/sessions/sess-search/events",
            params={"search": "hello"},
        )
        assert only_hello.status_code == 200
        events = only_hello.json()["events"]
        assert len(events) == 1
        assert "hello" in events[0]["payload"]["text"]


@pytest.mark.asyncio
async def test_search_matches_event_type(standalone_app):
    app, sm = standalone_app
    async with sm() as s:
        s.add(SessionRow(id="sess-types", message_count=2))
        s.add(
            TraceEventRow(
                session_id="sess-types",
                run_id="r1",
                sequence=0,
                event_type="ToolCallStart",
                payload={},
            )
        )
        s.add(
            TraceEventRow(
                session_id="sess-types",
                run_id="r1",
                sequence=1,
                event_type="RunFinished",
                payload={},
            )
        )
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        only_tool = await c.get(
            "/admin/api/v1/traces/sessions/sess-types/events",
            params={"search": "TOOL"},
        )
        assert only_tool.status_code == 200
        events = only_tool.json()["events"]
        assert len(events) == 1
        assert events[0]["event_type"] == "ToolCallStart"
