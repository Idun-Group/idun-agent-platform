"""Unit tests for multi-provider OIDC endpoints."""

import json
from base64 import b64encode
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import itsdangerous
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routers import auth as auth_module
from app.api.v1.routers.auth import OIDCProvider, _OAUTH_PROVIDER_SESSION_KEY
from app.core.settings import get_settings
from app.infrastructure.db.models.user import UserModel

pytestmark = [pytest.mark.asyncio, pytest.mark.usefixtures("_reset_oauth_singleton")]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_oauth_singleton():
    """Reset the lazy OAuth singleton between tests."""
    auth_module._oauth = None
    yield
    auth_module._oauth = None


@pytest.fixture()
def _sso_enabled(monkeypatch: pytest.MonkeyPatch):
    """Enable SSO mode."""
    monkeypatch.setattr(get_settings().auth, "disable_username_password", True)


@pytest.fixture()
def _sso_disabled(monkeypatch: pytest.MonkeyPatch):
    """Explicitly disable SSO mode."""
    monkeypatch.setattr(get_settings().auth, "disable_username_password", False)


@pytest.fixture()
def _only_google(monkeypatch: pytest.MonkeyPatch):
    """Configure only Google credentials."""
    settings = get_settings()
    monkeypatch.setattr(settings.auth.google, "client_id", "fake-google-id")
    monkeypatch.setattr(settings.auth.microsoft, "client_id", "")


@pytest.fixture()
def _only_microsoft(monkeypatch: pytest.MonkeyPatch):
    """Configure only Microsoft credentials."""
    settings = get_settings()
    monkeypatch.setattr(settings.auth.google, "client_id", "")
    monkeypatch.setattr(settings.auth.microsoft, "client_id", "fake-microsoft-id")


@pytest.fixture()
def _both_providers(monkeypatch: pytest.MonkeyPatch):
    """Configure both provider credentials."""
    settings = get_settings()
    monkeypatch.setattr(settings.auth.google, "client_id", "fake-google-id")
    monkeypatch.setattr(settings.auth.microsoft, "client_id", "fake-microsoft-id")


@pytest.fixture()
def _no_providers(monkeypatch: pytest.MonkeyPatch):
    """Clear all provider credentials."""
    settings = get_settings()
    monkeypatch.setattr(settings.auth.google, "client_id", "")
    monkeypatch.setattr(settings.auth.microsoft, "client_id", "")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_session_cookie(provider: str) -> str:
    """Build a signed Starlette session cookie with the OAuth provider key."""
    secret = get_settings().auth.session_secret
    data = {_OAUTH_PROVIDER_SESSION_KEY: provider}
    payload = b64encode(json.dumps(data).encode("utf-8"))
    signer = itsdangerous.TimestampSigner(str(secret))
    return signer.sign(payload).decode("utf-8")


def _make_mock_oauth(provider_name: str, userinfo: dict) -> MagicMock:
    """Build a mock OAuth registry with a single provider returning given userinfo.

    Uses spec=[] to disable MagicMock auto-attribute creation, so accessing
    an unregistered provider raises AttributeError instead of silently succeeding.
    """
    mock_client = MagicMock()
    mock_client.authorize_access_token = AsyncMock(
        return_value={"userinfo": userinfo}
    )
    mock_oauth = MagicMock(spec=[])
    setattr(mock_oauth, provider_name, mock_client)
    return mock_oauth


# ---------------------------------------------------------------------------
# GET /api/v1/auth/providers
# ---------------------------------------------------------------------------


class TestListProviders:
    """Tests for GET /api/v1/auth/providers."""

    @pytest.mark.usefixtures("_sso_disabled")
    async def test_returns_empty_when_sso_disabled(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/providers")
        assert response.status_code == 200
        assert response.json() == {"providers": []}

    @pytest.mark.usefixtures("_sso_enabled", "_both_providers")
    async def test_returns_both_when_configured(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/providers")
        assert response.status_code == 200
        data = response.json()
        assert "google" in data["providers"]
        assert "microsoft" in data["providers"]

    @pytest.mark.usefixtures("_sso_enabled", "_only_google")
    async def test_returns_only_google(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/providers")
        assert response.status_code == 200
        assert response.json()["providers"] == ["google"]

    @pytest.mark.usefixtures("_sso_enabled", "_only_microsoft")
    async def test_returns_only_microsoft(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/providers")
        assert response.status_code == 200
        assert response.json()["providers"] == ["microsoft"]

    @pytest.mark.usefixtures("_sso_enabled", "_no_providers")
    async def test_returns_empty_when_no_providers_configured(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/providers")
        assert response.status_code == 200
        assert response.json() == {"providers": []}


# ---------------------------------------------------------------------------
# GET /api/v1/auth/login/{provider}
# ---------------------------------------------------------------------------


class TestLoginProvider:
    """Tests for GET /api/v1/auth/login/{provider}."""

    @pytest.mark.usefixtures("_sso_disabled")
    async def test_returns_404_when_sso_disabled(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/auth/login/google", follow_redirects=False
        )
        assert response.status_code == 404

    @pytest.mark.usefixtures("_sso_enabled")
    async def test_returns_422_for_invalid_provider(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/auth/login/github", follow_redirects=False
        )
        assert response.status_code == 422

    @pytest.mark.usefixtures("_sso_enabled", "_no_providers")
    async def test_returns_400_for_unconfigured_provider(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/auth/login/google", follow_redirects=False
        )
        assert response.status_code == 400
        assert "not configured" in response.json()["detail"]

    @pytest.mark.usefixtures("_sso_enabled", "_only_google")
    async def test_returns_400_for_microsoft_when_only_google(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/auth/login/microsoft", follow_redirects=False
        )
        assert response.status_code == 400
        assert "not configured" in response.json()["detail"]


# ---------------------------------------------------------------------------
# GET /api/v1/auth/callback (provider-aware)
# ---------------------------------------------------------------------------


class TestCallback:
    """Tests for the provider-aware OIDC callback."""

    @pytest.mark.usefixtures("_sso_enabled", "_only_google")
    async def test_creates_user_with_google(
        self, client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ):
        mock_oauth = _make_mock_oauth("google", {
            "email": "test@google.com",
            "name": "Google User",
            "picture": "https://pic.example.com/g.jpg",
            "sub": "google-sub-123",
        })
        monkeypatch.setattr(auth_module, "_oauth", mock_oauth)

        response = await client.get(
            "/api/v1/auth/callback?code=fake&state=fake",
            follow_redirects=False,
            cookies={"session": _build_session_cookie("google")},
        )
        assert response.status_code == 302

        result = await db_session.execute(
            select(UserModel).where(UserModel.email == "test@google.com")
        )
        user = result.scalar_one()
        assert user.provider == "google"
        assert user.provider_sub == "google-sub-123"
        assert user.name == "Google User"

        mock_oauth.google.authorize_access_token.assert_called_once()

    @pytest.mark.usefixtures("_sso_enabled", "_only_microsoft")
    async def test_creates_user_with_microsoft_preferred_username(
        self, client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ):
        """Microsoft userinfo uses preferred_username instead of email."""
        mock_oauth = _make_mock_oauth("microsoft", {
            "preferred_username": "user@microsoft.com",
            "name": "Microsoft User",
            "sub": "ms-sub-456",
        })
        monkeypatch.setattr(auth_module, "_oauth", mock_oauth)

        response = await client.get(
            "/api/v1/auth/callback?code=fake&state=fake",
            follow_redirects=False,
            cookies={"session": _build_session_cookie("microsoft")},
        )
        assert response.status_code == 302

        result = await db_session.execute(
            select(UserModel).where(UserModel.email == "user@microsoft.com")
        )
        user = result.scalar_one()
        assert user.provider == "microsoft"
        assert user.provider_sub == "ms-sub-456"
        assert user.name == "Microsoft User"
        assert user.picture_url == ""

        mock_oauth.microsoft.authorize_access_token.assert_called_once()

    @pytest.mark.usefixtures("_sso_enabled", "_only_microsoft")
    async def test_updates_provider_on_returning_user(
        self, client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ):
        """User who first logged in via Google, then logs in via Microsoft — provider is updated."""
        existing_user = UserModel(
            id=uuid4(),
            email="shared@example.com",
            name="Original Name",
            provider="google",
            provider_sub="google-sub-original",
        )
        db_session.add(existing_user)
        await db_session.flush()

        mock_oauth = _make_mock_oauth("microsoft", {
            "preferred_username": "shared@example.com",
            "name": "Updated Name",
            "sub": "ms-sub-new",
        })
        monkeypatch.setattr(auth_module, "_oauth", mock_oauth)

        response = await client.get(
            "/api/v1/auth/callback?code=fake&state=fake",
            follow_redirects=False,
            cookies={"session": _build_session_cookie("microsoft")},
        )
        assert response.status_code == 302

        await db_session.refresh(existing_user)
        assert existing_user.provider == "microsoft"
        assert existing_user.provider_sub == "ms-sub-new"
        assert existing_user.name == "Updated Name"

    @pytest.mark.usefixtures("_sso_enabled", "_only_google")
    async def test_rejects_missing_email(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ):
        mock_oauth = _make_mock_oauth("google", {
            "name": "No Email User",
            "sub": "sub-no-email",
        })
        monkeypatch.setattr(auth_module, "_oauth", mock_oauth)

        response = await client.get(
            "/api/v1/auth/callback?code=fake&state=fake",
            follow_redirects=False,
            cookies={"session": _build_session_cookie("google")},
        )
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# OIDCProvider StrEnum
# ---------------------------------------------------------------------------


class TestOIDCProviderEnum:
    def test_values(self):
        assert OIDCProvider.GOOGLE == "google"
        assert OIDCProvider.MICROSOFT == "microsoft"

    def test_membership(self):
        assert OIDCProvider("google") == OIDCProvider.GOOGLE
        assert OIDCProvider("microsoft") == OIDCProvider.MICROSOFT

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            OIDCProvider("github")
