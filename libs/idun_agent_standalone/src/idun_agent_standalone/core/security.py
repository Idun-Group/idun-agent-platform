"""Local security primitives: password hashing + signed session cookies.

Strict-minimum scope:
- ``hash_password`` / ``verify_password`` wrap bcrypt directly. No
  passlib, no Argon2 round-tripping, no pepper.
- ``sign_session_id`` / ``verify_session_id`` wrap ``itsdangerous`` so
  the cookie carries a signed session id pointing to a row in
  ``standalone_session``. Tampering invalidates the signature.

Anything more elaborate (rate limit, CSRF token, sliding renewal,
password rotation tracking) is intentionally out of scope for this
slice; see the design doc § "Operational hardening posture" for the
full target.
"""

from __future__ import annotations

import secrets

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

_BCRYPT_ROUNDS = 12  # bcrypt default; keeps hash work under ~250ms on modern CPUs.

SESSION_COOKIE_NAME = "idun_session"


def hash_password(plain: str) -> str:
    """Return the bcrypt hash of a plaintext password as a UTF-8 string."""
    if not plain:
        raise ValueError("password must not be empty")
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time check of a plaintext against a stored bcrypt hash."""
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash — treat as a mismatch rather than crashing.
        return False


def new_session_id() -> str:
    """Return a 32-byte URL-safe random token for use as the session id."""
    return secrets.token_urlsafe(32)


def sign_session_id(session_id: str, secret: str) -> str:
    """Sign the session id with a TimestampSigner.

    The signed string is what we store in the cookie; the timestamp is
    not used for TTL (we keep TTL on the DB row's ``expires_at``) but
    keeps signed values from being trivially replayable across rotations
    of the secret.
    """
    return TimestampSigner(secret).sign(session_id).decode("utf-8")


def verify_session_id(signed: str, secret: str) -> str | None:
    """Return the unsigned session id, or ``None`` if the signature failed."""
    if not signed or not secret:
        return None
    try:
        # ``max_age`` left unset on purpose — the DB row owns TTL.
        return TimestampSigner(secret).unsign(signed).decode("utf-8")
    except (BadSignature, SignatureExpired):
        return None
