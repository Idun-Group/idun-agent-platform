"""Integration test: bad save -> runtime_state row updates -> GET reflects it."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_failed_reload_surfaces_in_runtime_status(
    standalone_app_with_failing_reload,
):
    """A round-3 failure must show up on the runtime/status endpoint."""
    transport = ASGITransport(app=standalone_app_with_failing_reload)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger a save that the failing reload_callable rejects.
        save_response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "trigger-failure"},
        )
        assert save_response.status_code == 500

        # Read the runtime status — the row should now reflect the failure.
        status_response = await client.get("/admin/api/v1/runtime/status")
    assert status_response.status_code == 200
    body = status_response.json()
    assert body["lastStatus"] == "reload_failed"
    assert body["lastMessage"].startswith("Engine reload failed")
    assert body["lastError"] is not None
