"""Tests for `_resolve_user_id` resolution order and contract.

Resolution priority:
1. SSO claim (`email`, then `sub`) when the verified user dict carries one.
2. `X-Idun-User-Id` request header when no claim is available.
3. Fresh `uuid4().hex` minted per-request as a safety net so callers
   never see ``None``.

The header is trusted only when claims are absent. With SSO configured
the JWT claim wins and the header is ignored, even when present.

Each test in this file targets a concrete failure mode rather than a
branch coverage tick:
  * the contract (always a non-empty string),
  * the trust boundary (claim beats header),
  * implementation traps (empty-string claim, UUID-not-hex, accidental
    caching of the fallback).
"""

from __future__ import annotations

import re

import pytest
from starlette.requests import Request

from idun_agent_engine.server.routers.agent import _resolve_user_id

pytestmark = pytest.mark.unit

_UUID_HEX = re.compile(r"[0-9a-f]{32}")


def _request_with_headers(headers: dict[str, str]) -> Request:
    """Build a Starlette Request carrying the given HTTP headers."""
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }
    return Request(scope)


# --- claim path -----------------------------------------------------------


def test_returns_email_claim_when_present():
    """Happy path: SSO with email claim wins. Pinning email over sub
    preserves the existing trace-dashboard contract."""
    req = _request_with_headers({})
    user = {"email": "alice@example.com", "sub": "alice-1"}
    assert _resolve_user_id(user, req) == "alice@example.com"


def test_falls_back_to_sub_when_email_missing():
    """Some IdPs (Okta machine-to-machine, custom audiences) omit email."""
    req = _request_with_headers({})
    user = {"sub": "alice-1"}
    assert _resolve_user_id(user, req) == "alice-1"


def test_empty_email_falls_through_to_sub():
    """An empty-string `email` claim must not become the resolved id.
    Catches `user.get("email", "")` without an emptiness check, which
    would return ``""`` and break downstream header passthrough."""
    req = _request_with_headers({})
    user = {"email": "", "sub": "alice-1"}
    assert _resolve_user_id(user, req) == "alice-1"


# --- header path ----------------------------------------------------------


def test_reads_x_idun_user_id_header_when_no_claim():
    """SSO off: the SPA-minted identity comes in via the header."""
    req = _request_with_headers({"X-Idun-User-Id": "bob@example.com"})
    assert _resolve_user_id(None, req) == "bob@example.com"


def test_header_lookup_is_case_insensitive():
    """Header lookup must follow HTTP norms; pins reliance on Starlette
    rather than ``request.headers[...]`` raw access."""
    req = _request_with_headers({"x-idun-user-id": "lowercase-client"})
    assert _resolve_user_id(None, req) == "lowercase-client"


def test_whitespace_only_header_falls_back_to_uuid():
    """A user-controlled header containing only whitespace must not
    become a user id. Combined with the contract test below, this pins
    both stripping and the absent-after-strip handling."""
    req = _request_with_headers({"X-Idun-User-Id": "   "})
    result = _resolve_user_id(None, req)
    assert _UUID_HEX.fullmatch(result), f"expected uuid hex, got {result!r}"


# --- trust boundary (security-critical) -----------------------------------


def test_claim_wins_over_header_when_both_present():
    """The header is trusted only when SSO is off. If a spoofed header
    could override a valid claim, an authenticated user could be
    impersonated by any client. Pin this explicitly."""
    req = _request_with_headers({"X-Idun-User-Id": "evil-spoofer"})
    user = {"email": "alice@example.com"}
    assert _resolve_user_id(user, req) == "alice@example.com"


# --- uuid fallback contract -----------------------------------------------


def test_uuid_fallback_returns_plain_hex_string():
    """``uuid.uuid4()`` returns a UUID object; ``.hex`` returns a 32-char
    lowercase hex string. If the implementation forgets ``.hex`` the
    downstream header passthrough breaks because ``str(UUID(...))`` has
    dashes (a different format from what the SPA mints with
    ``crypto.randomUUID()`` plus header normalization)."""
    req = _request_with_headers({})
    result = _resolve_user_id(None, req)
    assert isinstance(result, str)
    assert _UUID_HEX.fullmatch(result), f"expected 32-char hex, got {result!r}"


def test_uuid_fallbacks_are_distinct_across_requests():
    """If the fallback were a constant (``"anonymous"``) or accidentally
    cached, every visitor without SSO would share a single user_id —
    that's the exact cross-user-session-leak bug this work fixes."""
    req1 = _request_with_headers({})
    req2 = _request_with_headers({})
    assert _resolve_user_id(None, req1) != _resolve_user_id(None, req2)
