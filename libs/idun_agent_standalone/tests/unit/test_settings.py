"""Tests for the env-driven settings module."""

from __future__ import annotations

import pytest
from idun_agent_standalone.settings import AuthMode, StandaloneSettings


def test_defaults_outside_container(monkeypatch):
    monkeypatch.delenv("IDUN_ADMIN_AUTH_MODE", raising=False)
    monkeypatch.delenv("IDUN_IN_CONTAINER", raising=False)
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.NONE
    assert s.host == "0.0.0.0"
    assert s.port == 8000
    assert s.database_url.startswith("sqlite+aiosqlite://")
    assert s.session_ttl_seconds == 86400
    assert s.traces_retention_days == 30


def test_password_mode_default_in_container(monkeypatch):
    monkeypatch.setenv("IDUN_IN_CONTAINER", "1")
    monkeypatch.delenv("IDUN_ADMIN_AUTH_MODE", raising=False)
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.PASSWORD


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("IDUN_PORT", "9001")
    s = StandaloneSettings()
    assert s.auth_mode == AuthMode.PASSWORD
    assert s.database_url == "postgresql+asyncpg://u:p@h/db"
    assert s.port == 9001


def test_password_mode_requires_secret_and_hash(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.delenv("IDUN_SESSION_SECRET", raising=False)
    monkeypatch.delenv("IDUN_ADMIN_PASSWORD_HASH", raising=False)
    with pytest.raises(ValueError) as exc:
        StandaloneSettings().validate_for_runtime()
    msg = str(exc.value)
    assert "IDUN_ADMIN_PASSWORD_HASH" in msg or "IDUN_SESSION_SECRET" in msg


def test_resolved_session_secret_autogenerates_in_none_mode(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.delenv("IDUN_SESSION_SECRET", raising=False)
    s = StandaloneSettings()
    secret = s.resolved_session_secret()
    assert isinstance(secret, str)
    assert len(secret) >= 32


def test_resolved_session_secret_raises_in_password_mode_without_secret(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.delenv("IDUN_SESSION_SECRET", raising=False)
    with pytest.raises(ValueError):
        StandaloneSettings().resolved_session_secret()


def test_validate_for_runtime_rejects_oidc(monkeypatch):
    """OIDC is reserved for MVP-2; selecting it must fail fast."""
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "oidc")
    s = StandaloneSettings()
    with pytest.raises(ValueError, match="reserved for MVP-2"):
        s.validate_for_runtime()


def test_session_secret_too_short_raises(monkeypatch):
    """Password mode requires session_secret >= 32 chars (P2.4)."""
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv(
        "IDUN_ADMIN_PASSWORD_HASH",
        "$2b$12$abc.exampleexampleexampleexampleexampleexampleexample",
    )
    monkeypatch.setenv("IDUN_SESSION_SECRET", "tooshort")
    s = StandaloneSettings()
    with pytest.raises(ValueError, match="32 characters"):
        s.validate_for_runtime()


def test_force_admin_password_reset_defaults_false(monkeypatch):
    monkeypatch.delenv("IDUN_FORCE_ADMIN_PASSWORD_RESET", raising=False)
    s = StandaloneSettings()
    assert s.force_admin_password_reset is False


def test_force_admin_password_reset_env_override(monkeypatch):
    monkeypatch.setenv("IDUN_FORCE_ADMIN_PASSWORD_RESET", "1")
    s = StandaloneSettings()
    assert s.force_admin_password_reset is True
