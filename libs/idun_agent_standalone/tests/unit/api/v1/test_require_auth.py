"""Unit tests for the ``require_auth`` admin gate stub."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from idun_agent_standalone.api.v1.deps import require_auth
from idun_agent_standalone.core.settings import AuthMode


def _request_with_auth_mode(mode: AuthMode) -> SimpleNamespace:
    """Minimal Request-like object that exposes ``app.state.settings``."""
    settings = SimpleNamespace(auth_mode=mode)
    state = SimpleNamespace(settings=settings)
    app = SimpleNamespace(state=state)
    return SimpleNamespace(app=app)


async def test_require_auth_passes_in_none_mode() -> None:
    """``AuthMode.NONE`` is the laptop default and must not gate admin."""
    result = await require_auth(_request_with_auth_mode(AuthMode.NONE))
    assert result is None


async def test_require_auth_503s_in_password_mode() -> None:
    """``AuthMode.PASSWORD`` fails closed until the real implementation lands."""
    with pytest.raises(HTTPException) as excinfo:
        await require_auth(_request_with_auth_mode(AuthMode.PASSWORD))
    assert excinfo.value.status_code == 503
    assert "IDUN_ADMIN_AUTH_MODE=none" in excinfo.value.detail
