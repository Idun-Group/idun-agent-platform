"""Unit tests for session refresh middleware."""

import time

import pytest

from app.api.v1.routers.auth import _get_serializer

pytestmark = pytest.mark.asyncio


def _decode_cookie(token: str) -> dict:
    return _get_serializer().loads(token)


def _forge_cookie(payload: dict) -> str:
    return _get_serializer().dumps(payload)


def _get_set_cookie_headers(response, name: str = "sid") -> list[str]:
    return [
        v
        for k, v in response.headers.multi_items()
        if k.lower() == "set-cookie" and v.startswith(f"{name}=")
    ]


async def _signup(client, email: str) -> str:
    resp = await client.post(
        "/api/v1/auth/basic/signup",
        json={"email": email, "password": "password123", "name": "Test"},
    )
    assert resp.status_code == 200
    return resp.cookies["sid"]


class TestSessionPayload:
    async def test_signup_sets_created_at(self, client):
        token = await _signup(client, "payload-signup@example.com")
        payload = _decode_cookie(token)
        assert "created_at" in payload
        assert isinstance(payload["created_at"], int)
        assert abs(payload["created_at"] - int(time.time())) < 5

    async def test_signup_no_expires_at(self, client):
        token = await _signup(client, "payload-no-exp-signup@example.com")
        payload = _decode_cookie(token)
        assert "expires_at" not in payload

    async def test_login_sets_created_at(self, client):
        await _signup(client, "payload-login@example.com")
        resp = await client.post(
            "/api/v1/auth/basic/login",
            json={"email": "payload-login@example.com", "password": "password123"},
        )
        assert resp.status_code == 200
        payload = _decode_cookie(resp.cookies["sid"])
        assert "created_at" in payload
        assert "expires_at" not in payload


class TestNoRefreshOnFreshCookie:
    async def test_fresh_cookie_not_refreshed(self, client):
        await _signup(client, "fresh@example.com")
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 200
        sid_headers = _get_set_cookie_headers(response)
        assert len(sid_headers) == 0


class TestRefreshOnOldCookie:
    async def test_old_cookie_is_refreshed(self, client):
        token = await _signup(client, "old-cookie@example.com")
        original_payload = _decode_cookie(token)

        original_payload["created_at"] = int(time.time()) - 3600
        old_token = _forge_cookie(original_payload)
        client.cookies.clear()
        client.cookies.set("sid", old_token)

        from app.core.settings import get_settings

        settings = get_settings()
        original_threshold = settings.auth.session_refresh_threshold_seconds
        settings.auth.session_refresh_threshold_seconds = 0

        try:
            response = await client.get("/api/v1/auth/me")
            assert response.status_code == 200
            sid_headers = _get_set_cookie_headers(response)
            assert len(sid_headers) > 0

            new_token = response.cookies["sid"]
            new_payload = _decode_cookie(new_token)
            assert new_payload["principal"] == original_payload["principal"]
            assert new_payload["provider"] == original_payload["provider"]
        finally:
            settings.auth.session_refresh_threshold_seconds = original_threshold

    async def test_refresh_preserves_created_at(self, client):
        token = await _signup(client, "preserve-ts@example.com")
        payload = _decode_cookie(token)
        original_created_at = payload["created_at"]

        from app.core.settings import get_settings

        settings = get_settings()
        original_threshold = settings.auth.session_refresh_threshold_seconds
        settings.auth.session_refresh_threshold_seconds = 0

        try:
            response = await client.get("/api/v1/auth/me")
            assert response.status_code == 200
            sid_headers = _get_set_cookie_headers(response)
            assert len(sid_headers) > 0
            new_payload = _decode_cookie(response.cookies["sid"])
            assert new_payload["created_at"] == original_created_at
        finally:
            settings.auth.session_refresh_threshold_seconds = original_threshold


class TestAbsoluteMaxLifetime:
    async def test_session_past_max_lifetime_is_rejected(self, client):
        token = await _signup(client, "max-life@example.com")
        payload = _decode_cookie(token)

        payload["created_at"] = int(time.time()) - (8 * 86400)
        old_token = _forge_cookie(payload)
        client.cookies.clear()
        client.cookies.set("sid", old_token)

        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401


class TestBackwardCompat:
    async def test_old_cookie_without_created_at_gets_backfilled(self, client):
        token = await _signup(client, "backfill@example.com")
        payload = _decode_cookie(token)
        payload.pop("created_at", None)
        old_token = _forge_cookie(payload)
        client.cookies.clear()
        client.cookies.set("sid", old_token)

        from app.core.settings import get_settings

        settings = get_settings()
        original_threshold = settings.auth.session_refresh_threshold_seconds
        settings.auth.session_refresh_threshold_seconds = 0

        try:
            response = await client.get("/api/v1/auth/me")
            assert response.status_code == 200
            sid_headers = _get_set_cookie_headers(response)
            assert len(sid_headers) > 0
            new_payload = _decode_cookie(response.cookies["sid"])
            assert "created_at" in new_payload
            assert abs(new_payload["created_at"] - int(time.time())) < 5
        finally:
            settings.auth.session_refresh_threshold_seconds = original_threshold


class TestMiddlewareNoOp:
    async def test_no_cookie_no_effect(self, client):
        response = await client.get("/api/v1/healthz")
        assert response.status_code == 200
        sid_headers = _get_set_cookie_headers(response)
        assert len(sid_headers) == 0

    async def test_garbage_cookie_no_crash(self, client):
        client.cookies.set("sid", "garbage-not-a-real-token")
        response = await client.get("/api/v1/healthz")
        assert response.status_code == 200

    async def test_malformed_cookie_does_not_break_auth(self, client):
        client.cookies.set("sid", "totally-broken")
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401
