"""FastAPI dependency-injection helpers for the standalone admin API."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from idun_agent_schema.engine.engine import EngineConfig
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.core.security import SESSION_COOKIE_NAME
from idun_agent_standalone.core.settings import AuthMode


async def require_auth(request: Request) -> None:
    """Gate admin routes by ``IDUN_ADMIN_AUTH_MODE``.

    ``NONE`` is the laptop default and short-circuits. ``PASSWORD`` reads
    the ``idun_session`` cookie, verifies its signature, and looks up
    the session row — any failure becomes ``401`` so the bundled UI can
    redirect to ``/login``.
    """
    settings = request.app.state.settings
    if settings.auth_mode == AuthMode.NONE:
        return

    # Lazy imports — keeps the dependency graph thin for the NONE path
    # and avoids touching the DB session machinery when tests stub auth.
    from idun_agent_standalone.services.auth import validate_session

    sessionmaker = request.app.state.sessionmaker
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    async with sessionmaker() as session:
        ok = await validate_session(session, signed_cookie=cookie, settings=settings)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )


AuthDep = Annotated[None, Depends(require_auth)]


async def reload_disabled(request: Request) -> None:
    """Refuse engine ``POST /reload``.

    The standalone owns reloads through ``/admin/api/v1/*``, which run
    under the rebuild-and-validate pipeline. The engine's bare reload
    endpoint bypasses that pipeline, so we hard-disable it.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Engine /reload is disabled in standalone. "
            "Use /admin/api/v1/* to mutate config; reload is automatic."
        ),
    )


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield a per-request DB session bound to the standalone sessionmaker."""
    sm = request.app.state.sessionmaker
    async with sm() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_reload_callable(
    request: Request,
) -> Callable[[EngineConfig], Awaitable[None]]:
    """Return the engine reload callable, attached to ``app.state`` at startup.

    The callable accepts the materialized ``EngineConfig`` and applies it
    to the running engine. Raises ``ReloadInitFailed`` (from
    ``idun_agent_standalone.services.reload``) on failure.
    """
    callable_ = getattr(request.app.state, "reload_callable", None)
    if callable_ is None:
        raise RuntimeError(
            "reload_callable not attached to app.state — " "check app.py startup wiring"
        )
    return callable_  # type: ignore[no-any-return]


ReloadCallableDep = Annotated[
    Callable[[EngineConfig], Awaitable[None]],
    Depends(get_reload_callable),
]
