"""Integration test: standalone admin-only boot still mounts engine routes.

This pins the contract that prevents the regression where ``POST /agent/run``
returns 405 (or 404) when the standalone boots with no agent in the DB —
the wizard → tour → chat handoff requires the engine routes to exist
from boot onward. After ``configure_app`` runs (via the reload pipeline
following wizard materialize), the same routes start serving the real
agent without a process restart.

Mounted routes are checked end-to-end through ``create_standalone_app``
so this catches drift between the engine factory's unconfigured-boot
mode and the standalone's wiring of it.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.core.settings import StandaloneSettings


@pytest.fixture
def empty_db_settings(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> StandaloneSettings:
    """Build settings pointing at a fresh SQLite file in a tmp dir.

    The standalone's alembic env reads ``DATABASE_URL`` and uses the
    async driver throughout, so we hand it the async URL (the same one
    the runtime uses). Migrations run before ``create_standalone_app``
    so the schema is in place. An empty DB is the
    wizard-not-yet-materialized state we want to exercise.
    """
    from idun_agent_standalone.db.migrate import upgrade_head

    db_path = tmp_path / "empty.db"
    db_url = f"sqlite+aiosqlite:///{db_path}"

    # Pin DATABASE_URL via monkeypatch so the alembic env's
    # ``os.environ.get`` lookup picks up our test DB. monkeypatch
    # auto-restores the env after the test, no try/finally needed.
    monkeypatch.setenv("DATABASE_URL", db_url)
    upgrade_head()

    settings = StandaloneSettings(
        DATABASE_URL=db_url,
        IDUN_HOST="127.0.0.1",
        IDUN_PORT=8000,
    )
    return settings


@pytest.mark.asyncio
async def test_standalone_boots_unconfigured_and_routes_engine(empty_db_settings):
    """``create_standalone_app`` with an empty DB still mounts the engine
    routes. ``POST /agent/run`` returns 503 ``agent_not_ready`` rather
    than 404/405 — the route exists, the agent isn't ready yet."""
    app = await create_standalone_app(empty_db_settings)

    # Sanity: the route is registered on the FastAPI app even though no
    # agent has been materialized. Distinguishes this from the legacy
    # admin-only FastAPI() shape that returned 405/404.
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/agent/run" in paths, (
        "Engine /agent/run must be registered even when DB has no agent. "
        f"Mounted paths: {sorted(paths)}"
    )

    # ``ASGITransport`` does not trigger the FastAPI lifespan by default,
    # so simulate the post-lifespan state for an unconfigured boot:
    # ``app.state.agent = None`` (set by the engine's lifespan in
    # ``server/lifespan.py``). This is what ``get_agent`` reads to
    # decide between 503 ``agent_not_ready`` and the legacy
    # config-loading fallback.
    app.state.agent = None

    # End-to-end: hitting /agent/run returns 503 with the structured
    # agent_not_ready error code that the SPA can detect and use to
    # nudge the user back into onboarding.
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "messages": [{"id": "m1", "role": "user", "content": "hi"}],
                "state": {},
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
        assert response.status_code == 503, response.text
        detail = response.json().get("detail")
        assert isinstance(detail, dict)
        assert detail["error"]["code"] == "agent_not_ready"


@pytest.mark.asyncio
async def test_standalone_unconfigured_boot_serves_health_and_admin(empty_db_settings):
    """Unconfigured boot keeps the admin REST + /health surface reachable.
    These are the operator/wizard's only way to materialize an agent —
    they must work when the engine has no agent yet."""
    app = await create_standalone_app(empty_db_settings)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # /health works
        response = await client.get("/health")
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "ok"

        # /admin/api/v1/agent returns 404 (no agent row) — that is the
        # wizard-not-yet-materialized signal the SPA's chat root reads to
        # decide whether to redirect to /onboarding.
        response = await client.get("/admin/api/v1/agent")
        assert response.status_code == 404, response.text

        # /admin/api/v1/onboarding/scan works — wizard scanner endpoint.
        response = await client.post("/admin/api/v1/onboarding/scan")
        assert response.status_code == 200, response.text
