"""Unit tests for the ``require_auth`` admin gate."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from idun_agent_standalone.api.v1.deps import require_auth
from idun_agent_standalone.core.settings import AuthMode


class _NullSessionCtx:
    async def __aenter__(self):
        return SimpleNamespace()

    async def __aexit__(self, *_a):
        return None


class _FakeSessionMaker:
    def __call__(self) -> _NullSessionCtx:
        return _NullSessionCtx()


def _request(mode: AuthMode, *, cookie: str | None = None) -> SimpleNamespace:
    settings = SimpleNamespace(
        auth_mode=mode,
        session_secret="x" * 32,
        session_ttl_hours=24,
    )
    state = SimpleNamespace(settings=settings, sessionmaker=_FakeSessionMaker())
    app = SimpleNamespace(state=state)
    cookies = {"idun_session": cookie} if cookie else {}
    return SimpleNamespace(app=app, cookies=cookies)


async def test_require_auth_passes_in_none_mode() -> None:
    """``AuthMode.NONE`` is the laptop default and must not gate admin."""
    result = await require_auth(_request(AuthMode.NONE))
    assert result is None


async def test_require_auth_401_in_password_mode_without_cookie() -> None:
    """No cookie in password mode → 401."""
    request = _request(AuthMode.PASSWORD)
    # Patch validate_session so the dependency doesn't try to open a real
    # async session against the AsyncMock — we want to exercise the
    # 401-on-failed-validation branch, not the DB plumbing.
    with patch(
        "idun_agent_standalone.services.auth.validate_session",
        new=AsyncMock(return_value=False),
    ):
        with pytest.raises(HTTPException) as excinfo:
            await require_auth(request)
    assert excinfo.value.status_code == 401


async def test_require_auth_passes_in_password_mode_with_valid_cookie() -> None:
    """Valid signed cookie + live session row → pass-through."""
    request = _request(AuthMode.PASSWORD, cookie="signed-cookie-value")
    with patch(
        "idun_agent_standalone.services.auth.validate_session",
        new=AsyncMock(return_value=True),
    ):
        result = await require_auth(request)
    assert result is None
