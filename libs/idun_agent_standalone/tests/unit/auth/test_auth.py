"""Unit tests for the password and session helpers."""

import pytest
from idun_agent_standalone.auth.password import hash_password, verify_password
from idun_agent_standalone.auth.session import (
    SessionExpiredError,
    SessionInvalidError,
    sign_session,
    verify_session,
)


def test_hash_and_verify_roundtrip():
    h = hash_password("hunter2")
    assert verify_password("hunter2", h) is True
    assert verify_password("wrong", h) is False


def test_verify_password_handles_invalid_hash():
    assert verify_password("any", "not-a-hash") is False


def test_sign_and_verify_session_roundtrip():
    secret = "x" * 40
    token = sign_session(secret=secret, payload={"uid": "admin"})
    payload = verify_session(secret=secret, token=token, max_age_s=3600)
    assert payload["uid"] == "admin"


def test_verify_session_rejects_wrong_secret():
    token = sign_session(secret="x" * 40, payload={"uid": "admin"})
    with pytest.raises(SessionInvalidError):
        verify_session(secret="y" * 40, token=token, max_age_s=3600)


def test_verify_session_rejects_expired():
    import time

    token = sign_session(secret="x" * 40, payload={"uid": "admin"})
    # itsdangerous floors timestamps to whole seconds. To reliably observe
    # expiry without flakiness we sleep just over 2 seconds and pass
    # max_age_s=1 so the age check is firmly past the threshold.
    time.sleep(2.1)
    with pytest.raises(SessionExpiredError):
        verify_session(secret="x" * 40, token=token, max_age_s=1)
