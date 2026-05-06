"""``GET /sso/info`` public discovery route.

The chat SPA hits this on boot to decide whether to render a sign in
screen and which OIDC parameters to use. Returned values are public
OIDC parameters (issuer, clientId, audience) and an ``enabled`` flag.
No secrets are exposed. Route is unauthenticated by design so the
unauthenticated browser can read it before signing in.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from idun_agent_standalone.api.v1.deps import SessionDep
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.sso import StandaloneSsoRow

router = APIRouter(tags=["sso"])

logger = get_logger(__name__)


@router.get("/sso/info")
async def sso_info(session: SessionDep) -> dict[str, Any]:
    """Return the public OIDC parameters for the SPA, or ``enabled=false``."""
    row = (await session.execute(select(StandaloneSsoRow))).scalar_one_or_none()
    if row is None:
        return {"enabled": False}
    cfg = row.sso_config
    if not cfg.get("enabled", True):
        return {"enabled": False}
    return {
        "enabled": True,
        "issuer": cfg.get("issuer"),
        "clientId": cfg.get("client_id"),
        "audience": cfg.get("audience"),
    }
