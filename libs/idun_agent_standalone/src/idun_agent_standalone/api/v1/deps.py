"""FastAPI dependency-injection helpers for the standalone admin API."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from idun_agent_schema.engine.engine import EngineConfig
from sqlalchemy.ext.asyncio import AsyncSession


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
            "reload_callable not attached to app.state — "
            "check app.py startup wiring"
        )
    return callable_  # type: ignore[no-any-return]


ReloadCallableDep = Annotated[
    Callable[[EngineConfig], Awaitable[None]],
    Depends(get_reload_callable),
]
