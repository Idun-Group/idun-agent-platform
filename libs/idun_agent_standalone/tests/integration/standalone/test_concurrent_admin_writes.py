from __future__ import annotations

import asyncio

from httpx import ASGITransport, AsyncClient


def _ban_list_body(name: str) -> dict:
    return {
        "name": name,
        "position": "input",
        "guardrail": {
            "config_id": "ban_list",
            "api_key": "test-key",
            "banned_words": ["foo"],
        },
    }


async def test_concurrent_creates_serialize_through_pipeline(standalone_with_agent):
    call_log: list[str] = []

    async def recording_reload(_config, label_holder=call_log) -> None:
        label_holder.append("enter")
        await asyncio.sleep(0)
        label_holder.append("exit")

    standalone_with_agent.state.reload_callable = recording_reload

    transport = ASGITransport(app=standalone_with_agent)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = await asyncio.gather(
            client.post(
                "/admin/api/v1/guardrails", json=_ban_list_body("alpha filter")
            ),
            client.post(
                "/admin/api/v1/guardrails", json=_ban_list_body("beta filter")
            ),
        )
        listed = await client.get("/admin/api/v1/guardrails")

    assert all(r.status_code == 201 for r in results)
    assert call_log == ["enter", "exit", "enter", "exit"]
    assert len(listed.json()) == 2
