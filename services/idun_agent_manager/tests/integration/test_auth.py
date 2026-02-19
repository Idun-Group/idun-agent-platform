"""Integration tests for auth endpoints."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestBasicSignup:
    async def test_signup_success(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"
        assert "id" in data
        assert "workspace_ids" in data

    async def test_signup_without_name(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "noname@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "noname@example.com"
        assert data["name"] is None

    async def test_signup_duplicate_email(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "duplicate@example.com",
                "password": "password123",
            },
        )
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "duplicate@example.com",
                "password": "different456",
            },
        )
        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    async def test_signup_short_password(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "short@example.com",
                "password": "short",
            },
        )
        assert response.status_code == 422

    async def test_signup_invalid_email(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "not-an-email",
                "password": "password123",
            },
        )
        assert response.status_code == 422

    async def test_signup_sets_session_cookie(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "cookie@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        assert "sid" in response.cookies


class TestBasicLogin:
    async def test_login_success(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "login@example.com",
                "password": "password123",
            },
        )
        response = await client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "login@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "login@example.com"
        assert "id" in data
        assert "workspace_ids" in data

    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "wrongpwd@example.com",
                "password": "password123",
            },
        )
        response = await client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "wrongpwd@example.com",
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "nonexistent@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 401

    async def test_login_sets_session_cookie(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "logincookie@example.com",
                "password": "password123",
            },
        )
        response = await client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "logincookie@example.com",
                "password": "password123",
            },
        )
        assert "sid" in response.cookies


class TestAuthMe:
    async def test_me_authenticated(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "me@example.com",
                "password": "password123",
            },
        )
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["session"]["principal"]["email"] == "me@example.com"

    async def test_me_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401


class TestLogout:
    async def test_logout_clears_cookie(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "logout@example.com",
                "password": "password123",
            },
        )
        response = await client.post("/api/v1/auth/logout")
        assert response.status_code == 200
        assert response.json()["ok"] is True

    async def test_logout_invalidates_session(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "logout2@example.com",
                "password": "password123",
            },
        )
        assert (await client.get("/api/v1/auth/me")).status_code == 200

        await client.post("/api/v1/auth/logout")
        client.cookies.delete("sid")

        assert (await client.get("/api/v1/auth/me")).status_code == 401
