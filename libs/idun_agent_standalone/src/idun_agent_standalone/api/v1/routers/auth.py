"""``/admin/api/v1/auth`` minimal stub for the bundled UI.

The bundled UI calls ``/me`` on first load to decide whether to render
the password gate. In ``auth_mode=none`` the answer is always
"authenticated", so this router returns that shape and lets the UI
through. Real password mode (login, logout, change password, sessions)
lands when password auth is wired.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from idun_agent_standalone.core.logging import get_logger

router = APIRouter(prefix="/admin/api/v1/auth", tags=["admin", "auth"])

logger = get_logger(__name__)


@router.get("/me")
async def me(request: Request) -> dict[str, str | bool]:
    """Return the current auth mode and an authenticated flag.

    In ``auth_mode=none`` the user is implicitly authenticated. Password
    mode replaces this stub with a real session check later.
    """
    settings = request.app.state.settings
    return {"authenticated": True, "auth_mode": settings.auth_mode.value}
