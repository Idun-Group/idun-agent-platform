"""Integration tests for the pluggable `/reload` auth dependency.

The engine accepts an optional `reload_auth` callable on `create_app(...)`.
When provided, it is wired as a FastAPI dependency on `/reload`. When omitted,
the route remains unprotected (back-compat).

These tests rely on the `echo_agent_config` fixture from
`idun_agent_standalone.testing` (Task 1.5). Until that package exists they
are SKIPPED — but the file must collect cleanly.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from idun_agent_engine import create_app


@pytest.mark.asyncio
async def test_reload_unprotected_when_no_auth_dep(echo_agent_config):
    """Without `reload_auth`, /reload behaves exactly as before."""
    app = create_app(config_dict=echo_agent_config)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        await c.get("/health")  # trigger lifespan
        r = await c.post("/reload")
        assert r.status_code in (200, 204)


@pytest.mark.asyncio
async def test_reload_blocked_when_auth_dep_rejects(echo_agent_config):
    """When `reload_auth` raises HTTPException, FastAPI converts it to a response."""

    def deny() -> None:
        raise HTTPException(status_code=401, detail="nope")

    app = create_app(config_dict=echo_agent_config, reload_auth=deny)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        await c.get("/health")  # trigger lifespan
        r = await c.post("/reload")
        assert r.status_code == 401
