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
    """Without `reload_auth`, /reload skips the dep and runs normally.

    With no body and no manager env vars the existing /reload route
    returns 400 ("missing IDUN_AGENT_API_KEY/IDUN_MANAGER_HOST"). The
    test only verifies that the dep did NOT short-circuit the request
    with a 401 — i.e. no auth was applied — so any non-401 response
    confirms the back-compat path is preserved.
    """
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post("/reload")
        assert r.status_code != 401


@pytest.mark.asyncio
async def test_reload_blocked_when_auth_dep_rejects(echo_agent_config):
    """When `reload_auth` raises HTTPException, FastAPI converts it to a response."""

    def deny() -> None:
        raise HTTPException(status_code=401, detail="nope")

    app = create_app(config_dict=echo_agent_config, reload_auth=deny)
    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post("/reload")
        assert r.status_code == 401
