"""Integration tests for auth endpoints."""


class TestBasicSignup:
    def test_signup_success(self, client):
        response = client.post(
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

    def test_signup_duplicate_email(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "duplicate@example.com",
                "password": "password123",
            },
        )
        response = client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "duplicate@example.com",
                "password": "different456",
            },
        )
        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    def test_signup_sets_session_cookie(self, client):
        response = client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "cookie@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        assert "sid" in response.cookies


class TestBasicLogin:
    def test_login_success(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "login@example.com",
                "password": "password123",
            },
        )
        response = client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "login@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "login@example.com"

    def test_login_wrong_password(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "wrongpwd@example.com",
                "password": "password123",
            },
        )
        response = client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "wrongpwd@example.com",
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    def test_login_nonexistent_user(self, client):
        response = client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "nonexistent@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 401

    def test_login_sets_session_cookie(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "logincookie@example.com",
                "password": "password123",
            },
        )
        response = client.post(
            "/api/v1/auth/basic/login",
            json={
                "email": "logincookie@example.com",
                "password": "password123",
            },
        )
        assert "sid" in response.cookies


class TestAuthMe:
    def test_me_authenticated(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "me@example.com",
                "password": "password123",
            },
        )
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["session"]["principal"]["email"] == "me@example.com"

    def test_me_unauthenticated(self, client):
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401


class TestLogout:
    def test_logout_clears_cookie(self, client):
        client.post(
            "/api/v1/auth/basic/signup",
            json={
                "email": "logout@example.com",
                "password": "password123",
            },
        )
        response = client.post("/api/v1/auth/logout")
        assert response.status_code == 200
        assert response.json()["ok"] is True
