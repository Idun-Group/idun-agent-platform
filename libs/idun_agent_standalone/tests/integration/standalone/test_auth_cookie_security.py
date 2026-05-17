from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.core.security import sign_session_id
from idun_agent_standalone.infrastructure.db.models.session import (
    StandaloneSessionRow,
)
from sqlalchemy import select


async def _login(client: AsyncClient) -> str:
    response = await client.post(
        "/admin/api/v1/auth/login", json={"password": "hunter2"}
    )
    assert response.status_code == 200
    return client.cookies["idun_session"]


async def test_mangled_cookie_returns_unauthenticated(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signed = await _login(client)
        client.cookies.set("idun_session", signed[:-3] + "AAA")
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


async def test_forged_cookie_with_unknown_session_id_rejected(standalone_password):
    settings = standalone_password.state.settings
    forged = sign_session_id("unknown-session-id", settings.session_secret)
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("idun_session", forged)
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


async def test_secret_rotation_invalidates_previous_cookie(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _login(client)
        standalone_password.state.settings.session_secret = "y" * 64
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


async def test_expired_session_row_rejected_and_purged(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _login(client)

        async with standalone_password.state.sessionmaker() as session:
            row = (await session.execute(select(StandaloneSessionRow))).scalar_one()
            row.expires_at = datetime.now(UTC) - timedelta(seconds=5)
            await session.commit()

        response = await client.get("/admin/api/v1/auth/me")
        assert response.json()["authenticated"] is False

        async with standalone_password.state.sessionmaker() as session:
            remaining = (
                await session.execute(select(StandaloneSessionRow))
            ).scalar_one_or_none()
        assert remaining is None
