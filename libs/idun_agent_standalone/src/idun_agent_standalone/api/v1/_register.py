"""Single source of truth for the standalone HTTP router graph.

The standalone admin + public route surface is mounted in exactly one
place: :func:`register_standalone_routers`. The production app factory
(:func:`idun_agent_standalone.app.create_standalone_app`) and the
OpenAPI tagging tests both call this helper, so a router added here is
automatically picked up by both — no second graph to keep in sync.
"""

from __future__ import annotations

from collections.abc import Sequence

from fastapi import FastAPI, params

from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.auth import router as auth_router
from idun_agent_standalone.api.v1.routers.dashboard import (
    router as dashboard_router,
)
from idun_agent_standalone.api.v1.routers.guardrails import (
    router as guardrails_router,
)
from idun_agent_standalone.api.v1.routers.integrations import (
    router as integrations_router,
)
from idun_agent_standalone.api.v1.routers.mcp_servers import (
    router as mcp_servers_router,
)
from idun_agent_standalone.api.v1.routers.memory import router as memory_router
from idun_agent_standalone.api.v1.routers.observability import (
    router as observability_router,
)
from idun_agent_standalone.api.v1.routers.onboarding import (
    router as onboarding_router,
)
from idun_agent_standalone.api.v1.routers.prompts import (
    router as prompts_router,
)
from idun_agent_standalone.api.v1.routers.sso import router as sso_router
from idun_agent_standalone.api.v1.routers.sso_info import router as sso_info_router
from idun_agent_standalone.api.v1.routers.traces import router as traces_router
from idun_agent_standalone.runtime_config import router as runtime_config_router


def register_standalone_routers(
    app: FastAPI,
    admin_auth: Sequence[params.Depends] = (),
) -> None:
    """Mount every standalone admin + public router on ``app``.

    Single source of truth for the standalone HTTP surface — used by
    :func:`idun_agent_standalone.app.create_standalone_app` and by tests
    that need the same router graph without booting the full lifespan.

    ``admin_auth`` is the dependency list applied to admin (auth-gated)
    routers in production; tests pass an empty sequence so the routers
    are reachable without authentication.
    """
    deps = list(admin_auth)
    # Admin (auth-gated in production) routers, in the order matching
    # the historical inclusion in create_standalone_app.
    app.include_router(auth_router)
    app.include_router(agent_router, dependencies=deps)
    app.include_router(memory_router, dependencies=deps)
    app.include_router(observability_router, dependencies=deps)
    app.include_router(mcp_servers_router, dependencies=deps)
    app.include_router(guardrails_router, dependencies=deps)
    app.include_router(prompts_router, dependencies=deps)
    app.include_router(integrations_router, dependencies=deps)
    app.include_router(sso_router, dependencies=deps)
    app.include_router(onboarding_router, dependencies=deps)
    app.include_router(traces_router, dependencies=deps)
    app.include_router(dashboard_router, dependencies=deps)
    # Public (always reachable) routers.
    app.include_router(runtime_config_router)
    app.include_router(sso_info_router)
