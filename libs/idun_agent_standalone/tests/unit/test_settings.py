from __future__ import annotations

import pytest
from idun_agent_standalone.core.settings import (
    AuthMode,
    StandaloneSettings,
)
from pydantic import ValidationError


def test_password_mode_requires_session_secret_at_least_32_chars(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "x" * 31)
    with pytest.raises(ValidationError) as exc_info:
        StandaloneSettings()
    assert "IDUN_SESSION_SECRET" in str(exc_info.value)


def test_password_mode_accepts_secret_of_exactly_32_chars(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "x" * 32)
    settings = StandaloneSettings()
    assert settings.auth_mode == AuthMode.PASSWORD


def test_none_mode_does_not_require_session_secret(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.delenv("IDUN_SESSION_SECRET", raising=False)
    settings = StandaloneSettings()
    assert settings.auth_mode == AuthMode.NONE
    assert settings.session_secret == ""


@pytest.mark.parametrize("hours", [0, 721, -5])
def test_session_ttl_hours_rejects_out_of_range(monkeypatch, hours: int):
    monkeypatch.setenv("IDUN_SESSION_TTL_HOURS", str(hours))
    with pytest.raises(ValidationError):
        StandaloneSettings()


@pytest.mark.parametrize("hours", [1, 24, 720])
def test_session_ttl_hours_accepts_valid_range(monkeypatch, hours: int):
    monkeypatch.setenv("IDUN_SESSION_TTL_HOURS", str(hours))
    settings = StandaloneSettings()
    assert settings.session_ttl_hours == hours


def test_auth_mode_rejects_non_canonical_values(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "PASSWORD")
    with pytest.raises(ValidationError):
        StandaloneSettings()


def test_secret_validators_strip_trailing_newlines(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", ("x" * 64) + "\n")
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", "hash-value\r\n")
    settings = StandaloneSettings()
    assert settings.session_secret == "x" * 64
    assert settings.admin_password_hash == "hash-value"
