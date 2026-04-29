"""Standalone admin auth contracts.

Strict-minimum scope: ``/auth/me``, ``/auth/login``, ``/auth/logout``,
``/auth/change-password``. The rest of the design doc's auth surface
(rate limit responses, sliding renewal, password rotation invalidation,
CSRF posture) is deferred.
"""

from __future__ import annotations

from ._base import _CamelModel


class StandaloneAuthMe(_CamelModel):
    """Response of ``GET /admin/api/v1/auth/me``.

    ``authenticated`` is always true in ``auth_mode=none`` so the
    bundled UI can render without a login wall. In password mode it
    reflects the cookie/session check.
    """

    authenticated: bool
    auth_mode: str


class StandaloneAuthLoginBody(_CamelModel):
    """Body of ``POST /admin/api/v1/auth/login``.

    Single-tenant: there is no username field — the standalone has one
    admin row identified by the singleton primary key.
    """

    password: str


class StandaloneAuthChangePasswordBody(_CamelModel):
    """Body of ``POST /admin/api/v1/auth/change-password``."""

    current_password: str
    new_password: str


class StandaloneAuthMutationResult(_CamelModel):
    """Bare-success body for login / logout / change-password.

    Login + logout side-effects (session cookie set/cleared) are carried
    on the HTTP response itself; the body just acknowledges the outcome.
    """

    ok: bool
