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


@pytest.mark.asyncio
async def test_post_configure_callbacks_fire_on_boot_and_reload(
    echo_agent_config, tmp_path, monkeypatch
):
    """``configure_app`` invokes every ``post_configure_callbacks`` entry.

    Boot fires the callback once. ``POST /reload`` rebuilds the agent and
    must fire the callback again — otherwise embedders that re-attach
    cross-cutting concerns (run-event observers, telemetry handlers) lose
    them silently after every reload.
    """
    import yaml

    # Persist the boot config to disk so /reload can replay it via the
    # ``path=`` body param (this side-steps the manager API requirement).
    config_path = tmp_path / "echo.yaml"
    config_path.write_text(yaml.safe_dump(echo_agent_config))

    app = create_app(config_dict=echo_agent_config)

    fired: list[str] = []

    async def _record(_app) -> None:
        agent_name = type(getattr(_app.state, "agent", None)).__name__
        fired.append(agent_name)

    # Register BEFORE lifespan so the boot configure_app picks it up.
    app.state.post_configure_callbacks = [_record]

    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        # Boot has fired the callback once.
        assert len(fired) == 1, fired

        r = await c.post("/reload", json={"path": str(config_path)})
        assert r.status_code == 200, r.text

        # Reload must re-fire the same callback against the new agent.
        assert len(fired) == 2, fired


@pytest.mark.asyncio
async def test_post_configure_callback_failure_does_not_break_reload(
    echo_agent_config, tmp_path
):
    """A throwing callback is logged and skipped — reload still succeeds.

    We do not want a buggy embedder callback to take the whole reload
    response down with it.
    """
    import yaml

    config_path = tmp_path / "echo.yaml"
    config_path.write_text(yaml.safe_dump(echo_agent_config))

    app = create_app(config_dict=echo_agent_config)

    survived: list[bool] = []

    async def _bad(_app) -> None:
        raise RuntimeError("boom")

    async def _good(_app) -> None:
        survived.append(True)

    app.state.post_configure_callbacks = [_bad, _good]

    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        # Boot ran both — _good still fired despite _bad raising.
        assert survived == [True]

        r = await c.post("/reload", json={"path": str(config_path)})
        assert r.status_code == 200, r.text
        assert survived == [True, True]
