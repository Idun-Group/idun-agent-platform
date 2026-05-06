"""Integration tests for ``/admin/api/v1/agent`` against the real reload pipeline.

Drives the FastAPI router through HTTPX with an injected stub reload
callable; round 2 + round 3 + structural change all exercise the
mutex + outcome recording path end-to-end.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)
from idun_agent_standalone.services import runtime_state
from idun_agent_standalone.services.reload import ReloadInitFailed


@pytest.fixture
async def admin_app(async_session, stub_reload_callable):
    """Minimal FastAPI app mounting the agent router with overrides.

    The session and reload-callable dependencies are overridden to
    point at the in-memory async_session fixture and the AsyncMock
    reload callable; admin exception handlers are registered so the
    response envelope shape matches production.
    """
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.state.reload_callable = stub_reload_callable

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return stub_reload_callable

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable

    return app


async def _seed_agent(async_session) -> None:
    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()


async def test_get_agent_returns_row(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 200
    assert response.json()["name"] == "Ada"


async def test_patch_agent_happy_path(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "Renamed"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["name"] == "Renamed"
    assert body["reload"]["status"] == "reloaded"
    stub_reload_callable.assert_called_once()


async def test_patch_empty_body_is_noop(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/admin/api/v1/agent", json={})
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "reloaded"
    assert body["reload"]["message"] == "No changes."
    stub_reload_callable.assert_not_called()


async def test_patch_round_3_failure_returns_500(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    stub_reload_callable.side_effect = ReloadInitFailed("engine boom")

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent",
            json={"name": "Renamed"},
        )
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "reload_failed"

        # Re-fetch through the same client to confirm rollback — name unchanged
        get_response = await client.get("/admin/api/v1/agent")
    assert get_response.json()["name"] == "Ada"


async def test_patch_records_outcome_in_runtime_state(
    admin_app, async_session, stub_reload_callable
) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.patch("/admin/api/v1/agent", json={"name": "Renamed"})
    state = await runtime_state.get(async_session)
    assert state is not None
    assert state.last_status == "reloaded"


async def test_concurrent_patches_serialize(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Two simultaneous PATCHes must serialize through ``_reload_mutex``.

    We assert this indirectly: both succeed (no race-induced 500), and
    the reload callable is called exactly twice.
    """
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = await asyncio.gather(
            client.patch("/admin/api/v1/agent", json={"name": "A"}),
            client.patch("/admin/api/v1/agent", json={"name": "B"}),
        )
    assert all(r.status_code == 200 for r in results)
    assert stub_reload_callable.call_count == 2


async def test_get_returns_404_when_not_configured(admin_app) -> None:
    """Cold-start state — no agent row, GET returns 404 in admin envelope."""
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_malformed_body_returns_422(admin_app, async_session) -> None:
    await _seed_agent(async_session)
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send name=null (forbidden by _no_null_name validator)
        response = await client.patch("/admin/api/v1/agent", json={"name": None})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_failed"


async def test_patch_dry_run_skips_commit_and_reload(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Dry-run on a valid PATCH must return reload.status=not_attempted
    and leave the DB unchanged."""
    from sqlalchemy import select

    await _seed_agent(async_session)

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent?dryRun=true",
            json={"name": "renamed-via-dry-run"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reload"]["status"] == "not_attempted"
    # Returned data reflects the unchanged row.
    assert body["data"]["name"] == "Ada"
    # The reload callable was never invoked on a dry-run.
    stub_reload_callable.assert_not_called()

    # DB row is unchanged: same count, same name.
    rows = (await async_session.execute(select(StandaloneAgentRow))).scalars().all()
    assert len(rows) == 1
    assert rows[0].name == "Ada"


async def test_patch_dry_run_with_bad_graph_definition_returns_422(
    admin_app, async_session, stub_reload_callable
) -> None:
    """Dry-run that hits a broken graph_definition returns 422 + field_errors.

    The PATCH body is metadata-only (StandaloneAgentPatch doesn't accept
    baseEngineConfig), so we seed an agent row whose graph_definition
    already points at a missing file. The round 2.5 probe fires during
    dry-run and surfaces the field error without committing or reloading.
    """
    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "./missing.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()

    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            "/admin/api/v1/agent?dryRun=true",
            json={"name": "renamed-via-dry-run"},
        )
    assert response.status_code == 422
    body = response.json()
    paths = [fe["field"] for fe in body["error"]["fieldErrors"]]
    assert "agent.config.graphDefinition" in paths
    stub_reload_callable.assert_not_called()
