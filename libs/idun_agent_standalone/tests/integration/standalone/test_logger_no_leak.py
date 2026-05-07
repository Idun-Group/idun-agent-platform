from __future__ import annotations

import logging

from httpx import ASGITransport, AsyncClient

from _helpers.logs import captured_logs

_PASSWORD = "hunter2"
_NEW_PASSWORD = "newSecretValue123"


async def test_login_does_not_log_password(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with captured_logs("idun_agent_standalone", logging.DEBUG) as records:
            await client.post(
                "/admin/api/v1/auth/login", json={"password": _PASSWORD}
            )
    for record in records:
        assert _PASSWORD not in record.getMessage()


async def test_failed_login_does_not_log_password(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with captured_logs("idun_agent_standalone", logging.DEBUG) as records:
            await client.post(
                "/admin/api/v1/auth/login", json={"password": "wrong-bad-password"}
            )
    for record in records:
        assert "wrong-bad-password" not in record.getMessage()


async def test_change_password_does_not_log_either_password(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/admin/api/v1/auth/login", json={"password": _PASSWORD}
        )
        with captured_logs("idun_agent_standalone", logging.DEBUG) as records:
            response = await client.post(
                "/admin/api/v1/auth/change-password",
                json={
                    "currentPassword": _PASSWORD,
                    "newPassword": _NEW_PASSWORD,
                },
            )
    assert response.status_code == 200
    for record in records:
        message = record.getMessage()
        assert _PASSWORD not in message
        assert _NEW_PASSWORD not in message
