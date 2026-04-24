"""Signed session cookies (itsdangerous URLSafeTimedSerializer).

Distinct exception types for "expired" vs "invalid" so the
``require_auth`` dependency can return more useful 401 detail messages.
"""

from __future__ import annotations

from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


class SessionInvalidError(Exception):
    """Raised when a session cookie signature does not verify."""


class SessionExpiredError(Exception):
    """Raised when a session cookie is signed but past its TTL."""


_SALT = "idun-standalone-session"


def sign_session(*, secret: str, payload: dict[str, Any]) -> str:
    return URLSafeTimedSerializer(secret, salt=_SALT).dumps(payload)


def verify_session(
    *, secret: str, token: str, max_age_s: int
) -> dict[str, Any]:
    serializer = URLSafeTimedSerializer(secret, salt=_SALT)
    try:
        return serializer.loads(token, max_age=max_age_s)
    except SignatureExpired as e:
        raise SessionExpiredError(str(e)) from e
    except BadSignature as e:
        raise SessionInvalidError(str(e)) from e
