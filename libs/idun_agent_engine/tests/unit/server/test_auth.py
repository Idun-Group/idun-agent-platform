"""Tests for OIDC JWT validation (server/auth.py)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request
from idun_agent_schema.engine.sso import SSOConfig


@pytest.mark.unit
class TestGetVerifiedUser:
    """Test get_verified_user FastAPI dependency."""

    @pytest.mark.asyncio
    async def test_no_sso_configured_passes_through(self):
        """When sso_validator is None, returns None (no protection)."""
        from idun_agent_engine.server.auth import get_verified_user

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.sso_validator = None

        result = await get_verified_user(mock_request)
        assert result is None

    @pytest.mark.asyncio
    async def test_missing_auth_header_returns_401(self):
        """When SSO is configured but no Authorization header, raises 401."""
        from idun_agent_engine.server.auth import OIDCValidator, get_verified_user

        validator = MagicMock(spec=OIDCValidator)
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.sso_validator = validator
        mock_request.headers = {}

        with pytest.raises(HTTPException) as exc_info:
            await get_verified_user(mock_request)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_valid_token_returns_claims(self):
        """When token is valid, returns the decoded claims."""
        from idun_agent_engine.server.auth import OIDCValidator, get_verified_user

        expected_claims = {"sub": "user-1", "email": "test@company.com"}

        validator = MagicMock(spec=OIDCValidator)
        validator.validate_token = AsyncMock(return_value=expected_claims)

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.sso_validator = validator
        mock_request.headers = {"Authorization": "Bearer valid-token"}

        result = await get_verified_user(mock_request)

        assert result == expected_claims
        validator.validate_token.assert_called_once_with("valid-token")

    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self):
        """When token is expired, validate_token raises 401."""
        from idun_agent_engine.server.auth import OIDCValidator, get_verified_user

        validator = MagicMock(spec=OIDCValidator)
        validator.validate_token = AsyncMock(
            side_effect=HTTPException(status_code=401, detail="Token has expired")
        )

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.sso_validator = validator
        mock_request.headers = {"Authorization": "Bearer expired-token"}

        with pytest.raises(HTTPException) as exc_info:
            await get_verified_user(mock_request)

        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail


@pytest.mark.unit
class TestOIDCValidator:
    """Test OIDCValidator token validation."""

    def _make_config(self, **overrides) -> SSOConfig:
        defaults = {
            "issuer": "https://accounts.google.com",
            "client_id": "test-client-id",
        }
        defaults.update(overrides)
        return SSOConfig(**defaults)

    @pytest.mark.asyncio
    async def test_domain_restriction_rejects_wrong_domain(self):
        """Tokens with emails outside allowed_domains are rejected."""
        from idun_agent_engine.server.auth import OIDCValidator

        config = self._make_config(allowed_domains=["company.com"])
        validator = OIDCValidator(config)

        with patch("idun_agent_engine.server.auth.jwt") as mock_jwt:
            mock_jwks_client = MagicMock()
            mock_jwks_client.get_signing_key_from_jwt.return_value = MagicMock(
                key="fake-key"
            )

            with patch.object(validator, "_ensure_jwks", return_value=mock_jwks_client):
                mock_jwt.decode.return_value = {
                    "sub": "user-1",
                    "email": "user@other.com",
                    "iss": "https://accounts.google.com",
                    "aud": "test-client-id",
                }

                with pytest.raises(HTTPException) as exc_info:
                    await validator.validate_token("some-token")

                assert exc_info.value.status_code == 403
                assert "domain" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_domain_restriction_accepts_correct_domain(self):
        """Tokens with emails in allowed_domains are accepted."""
        from idun_agent_engine.server.auth import OIDCValidator

        config = self._make_config(allowed_domains=["company.com"])
        validator = OIDCValidator(config)

        with patch("idun_agent_engine.server.auth.jwt") as mock_jwt:
            mock_jwks_client = MagicMock()
            mock_jwks_client.get_signing_key_from_jwt.return_value = MagicMock(
                key="fake-key"
            )

            with patch.object(validator, "_ensure_jwks", return_value=mock_jwks_client):
                mock_jwt.decode.return_value = {
                    "sub": "user-1",
                    "email": "user@company.com",
                    "iss": "https://accounts.google.com",
                    "aud": "test-client-id",
                }

                claims = await validator.validate_token("some-token")

                assert claims["email"] == "user@company.com"

    @pytest.mark.asyncio
    async def test_email_restriction_rejects_unlisted_email(self):
        """Tokens with emails not in allowed_emails are rejected."""
        from idun_agent_engine.server.auth import OIDCValidator

        config = self._make_config(allowed_emails=["admin@company.com"])
        validator = OIDCValidator(config)

        with patch("idun_agent_engine.server.auth.jwt") as mock_jwt:
            mock_jwks_client = MagicMock()
            mock_jwks_client.get_signing_key_from_jwt.return_value = MagicMock(
                key="fake-key"
            )

            with patch.object(validator, "_ensure_jwks", return_value=mock_jwks_client):
                mock_jwt.decode.return_value = {
                    "sub": "user-1",
                    "email": "other@company.com",
                    "iss": "https://accounts.google.com",
                    "aud": "test-client-id",
                }

                with pytest.raises(HTTPException) as exc_info:
                    await validator.validate_token("some-token")

                assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_no_restrictions_accepts_any_valid_token(self):
        """Without domain/email restrictions, any valid token is accepted."""
        from idun_agent_engine.server.auth import OIDCValidator

        config = self._make_config()
        validator = OIDCValidator(config)

        with patch("idun_agent_engine.server.auth.jwt") as mock_jwt:
            mock_jwks_client = MagicMock()
            mock_jwks_client.get_signing_key_from_jwt.return_value = MagicMock(
                key="fake-key"
            )

            with patch.object(validator, "_ensure_jwks", return_value=mock_jwks_client):
                mock_jwt.decode.return_value = {
                    "sub": "user-1",
                    "email": "anyone@anywhere.com",
                    "iss": "https://accounts.google.com",
                    "aud": "test-client-id",
                }

                claims = await validator.validate_token("some-token")

                assert claims["sub"] == "user-1"
