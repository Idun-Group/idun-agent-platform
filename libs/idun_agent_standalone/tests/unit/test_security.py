"""Unit tests for ``core.security``."""

from __future__ import annotations

import pytest
from idun_agent_standalone.core.security import (
    hash_password,
    new_session_id,
    sign_session_id,
    verify_password,
    verify_session_id,
)

_SECRET = "x" * 64


def test_hash_password_roundtrip() -> None:
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_hash_password_empty_rejected() -> None:
    with pytest.raises(ValueError):
        hash_password("")


def test_verify_password_handles_malformed_hash() -> None:
    """A garbage stored hash returns False, not an exception."""
    assert verify_password("anything", "not-a-bcrypt-hash") is False


def test_session_id_signature_roundtrip() -> None:
    sid = new_session_id()
    signed = sign_session_id(sid, _SECRET)
    assert verify_session_id(signed, _SECRET) == sid


def test_session_id_signature_with_wrong_secret_returns_none() -> None:
    sid = new_session_id()
    signed = sign_session_id(sid, _SECRET)
    assert verify_session_id(signed, "y" * 64) is None


def test_verify_session_handles_garbage_input() -> None:
    assert verify_session_id("not-a-signed-value", _SECRET) is None
    assert verify_session_id("", _SECRET) is None


def test_new_session_id_is_unique_and_url_safe() -> None:
    ids = {new_session_id() for _ in range(20)}
    assert len(ids) == 20
    for sid in ids:
        # urlsafe_b64 alphabet only: A-Z a-z 0-9 - _
        assert all(c.isalnum() or c in "-_" for c in sid)
