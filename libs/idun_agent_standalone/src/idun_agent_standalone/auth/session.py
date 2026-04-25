"""Signed session cookies (itsdangerous URLSafeTimedSerializer).

The serializer's own timestamp drives expiry checks; we additionally
inject ``iat`` into the payload so callers (e.g. ``require_auth``) can
reject sessions issued before a password rotation without needing to
crack the inner serializer state.

Distinct exception types for "expired" vs "invalid" so the
``require_auth`` dependency can return more useful 401 detail messages.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


class SessionInvalidError(Exception):
    """Raised when a session cookie signature does not verify."""


class SessionExpiredError(Exception):
    """Raised when a session cookie is signed but past its TTL."""


_SALT = "idun-standalone-session"


def sign_session(*, secret: str, payload: dict[str, Any]) -> str:
    """Sign ``payload`` and stamp ``iat`` if not already present.

    The ``iat`` timestamp lets the auth dependency reject sessions issued
    before a password rotation; the serializer's own timestamp is used
    for TTL checks but is not exposed by ``loads`` directly.
    """
    enriched = dict(payload)
    enriched.setdefault("iat", int(time.time()))
    return URLSafeTimedSerializer(secret, salt=_SALT).dumps(enriched)


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


def verify_session_with_meta(
    *, secret: str, token: str, max_age_s: int
) -> tuple[dict[str, Any], datetime]:
    """Like :func:`verify_session` but also returns the serializer's signing time.

    Callers needing both the payload and the cookie's age (e.g. for the
    sliding-expiry refresh logic) should use this; it avoids parsing the
    token twice.
    """
    serializer = URLSafeTimedSerializer(secret, salt=_SALT)
    try:
        payload, signed_at = serializer.loads(
            token, max_age=max_age_s, return_timestamp=True
        )
    except SignatureExpired as e:
        raise SessionExpiredError(str(e)) from e
    except BadSignature as e:
        raise SessionInvalidError(str(e)) from e
    return payload, signed_at
