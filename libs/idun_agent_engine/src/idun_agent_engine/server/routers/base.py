"""Base routes for service health and landing info."""

import inspect
import logging
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..._version import __version__
from ...core.config_builder import ConfigBuilder
from ..lifespan import (
    cleanup_agent,
    configure_app,
    drain_inflight_runs,
    ensure_reload_state,
)

logger = logging.getLogger(__name__)

base_router = APIRouter(tags=["Runtime"])


class ReloadRequest(BaseModel):
    """Request body for reload endpoint."""

    path: str | None = None


class HealthResponse(BaseModel):
    """Response shape for ``/health``.

    ``reason`` is only emitted when an assembly failure handler set
    ``app.state.boot_error``; the route uses ``response_model_exclude_unset``
    so the field stays absent (not ``null``) on the happy path.
    """

    status: Literal["ok", "degraded"]
    service: str
    version: str
    agent_ready: bool
    agent_name: str | None
    reason: str | None = None


async def _reload_auth_dep(request: Request) -> None:
    """Resolve the optional /reload auth dependency from app state.

    When ``app.state.reload_auth`` is ``None`` (the default), this is a
    no-op so ``/reload`` remains unprotected for backwards compatibility.
    Otherwise the callable is invoked; it is expected to raise
    :class:`fastapi.HTTPException` on rejection. Both sync and async
    callables are supported.

    The registered callable may itself be a FastAPI dependency that
    declares ``Depends(...)``-typed parameters (e.g. the standalone's
    ``require_auth`` which depends on injected ``Settings``). We run it
    through FastAPI's dependency solver so those nested deps resolve
    correctly. A no-arg or single-``request`` callable still works
    because the solver fills only the parameters it needs.
    """
    auth = getattr(request.app.state, "reload_auth", None)
    if auth is None:
        return None

    from contextlib import AsyncExitStack

    from fastapi.dependencies.utils import get_dependant, solve_dependencies

    dependant = get_dependant(path="/reload", call=auth)
    async with AsyncExitStack() as stack:
        solved = await solve_dependencies(
            request=request,
            dependant=dependant,
            async_exit_stack=stack,
            embed_body_fields=False,
        )
    # solve_dependencies returns a SolvedDependency(values, errors, ...) in
    # FastAPI 0.115+. Older releases returned a tuple; we support both.
    if hasattr(solved, "values"):
        kwargs = solved.values
        errors = solved.errors
    else:  # pragma: no cover — older FastAPI shapes
        kwargs, errors, *_ = solved
    if errors:
        from fastapi.exceptions import RequestValidationError

        raise RequestValidationError(errors)

    result = auth(**kwargs)
    if inspect.isawaitable(result):
        await result
    return None


@base_router.get(
    "/health",
    response_model=HealthResponse,
    response_model_exclude_unset=True,
)
def health_check(request: Request) -> HealthResponse:
    """Health check endpoint for monitoring and load balancers.

    Returns ``status: "ok"`` only when an agent is registered and
    ``/agent/*`` will accept requests. Returns ``status: "degraded"`` with
    ``agent_ready: false`` when no agent is configured — e.g. standalone
    admin-only mode after an ``assemble_engine_config`` error, or the
    pre-onboarding wizard state. When ``app.state.boot_error`` is set by
    the standalone's assembly failure handler, it is surfaced as ``reason``
    so operators can diagnose without grepping logs.
    """
    agent = getattr(request.app.state, "agent", None)
    configuration = getattr(agent, "configuration", None)
    agent_name = getattr(configuration, "name", None)
    agent_ready = agent is not None
    boot_error = getattr(request.app.state, "boot_error", None)
    # TODO: return managed agent UUID (from manager API response) for stronger
    # identity validation. Currently agent_name is the only shared identifier.
    fields: dict[str, object] = {
        "status": "ok" if agent_ready else "degraded",
        "service": "idun-agent-engine",
        "version": __version__,
        "agent_ready": agent_ready,
        "agent_name": agent_name,
    }
    if boot_error:
        fields["reason"] = str(boot_error)
    return HealthResponse(**fields)


@base_router.post("/reload")
async def reload_config(
    request: Request,
    body: ReloadRequest | None = None,
    _auth: None = Depends(_reload_auth_dep),
):
    """Reload the agent configuration from the manager or a file.

    The optional ``_auth`` dependency consults ``app.state.reload_auth``
    (configured via ``create_app(reload_auth=...)``) and, if set, invokes it.
    The configured callable raises :class:`fastapi.HTTPException` to deny.

    Reloads serialize on a per-app lock and build the new agent before tearing
    down the old one. ``app.state.agent`` is swapped in one assignment and the
    previous agent is closed only after its in-flight runs drain, so a reload
    never corrupts the shared route table or hands a request a closed agent.
    """
    app = request.app
    async with ensure_reload_state(app):
        try:
            if body and body.path:
                logger.info(f"🔄 Reloading configuration from file: {body.path}...")
                new_config = ConfigBuilder.load_from_file(body.path)
            else:
                logger.info("🔄 Reloading configuration from manager...")
                agent_api_key = os.getenv("IDUN_AGENT_API_KEY")
                manager_host = os.getenv("IDUN_MANAGER_HOST")

                if not agent_api_key or not manager_host:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot reload from manager: IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST environment variables are missing.",
                    )

                config_builder = await ConfigBuilder().with_config_from_api(
                    agent_api_key=agent_api_key, url=manager_host
                )
                new_config = config_builder.build()

            old_agent = getattr(app.state, "agent", None)

            # Tear down the old agent's integrations, routes, and OTel, but keep
            # the old agent object alive so its in-flight runs keep working.
            await cleanup_agent(app, close_agent=False)

            # Build and publish the new agent (configure_app swaps app.state.agent).
            await configure_app(app, new_config)

            # Drain runs that captured the old agent, then close it. Skipped when
            # configure_app left the same object in place (no real swap).
            if old_agent is not None and old_agent is not getattr(
                app.state, "agent", None
            ):
                await drain_inflight_runs(app)
                close_fn = getattr(old_agent, "close", None)
                if callable(close_fn):
                    result = close_fn()
                    if inspect.isawaitable(result):
                        await result

            return {
                "status": "success",
                "message": "Agent configuration reloaded successfully",
            }

        except HTTPException:
            raise

        except Exception as e:
            logger.exception(f"❌ Error reloading configuration: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to reload configuration: {str(e)}"
            )


# Engine info — always served at /_engine/info. The bare `/` route is
# registered conditionally by `app_factory.create_app` only when no static
# UI is mounted at `/`, so users can override `/` by setting IDUN_UI_DIR
# without route shadowing.
@base_router.get("/_engine/info")
def engine_info():
    """Engine info endpoint — basic information about the service."""
    return {
        "message": "Welcome to your Idun Agent Engine server!",
        "docs": "/docs",
        "health": "/health",
        "agent_endpoints": {"invoke": "/agent/invoke", "stream": "/agent/stream"},
    }


# # Add info endpoint for detailed server and agent information
# @base_router.get("/info")
# def get_info(request: Request):
#     """Get detailed information about the server and loaded agent."""
#     info = {
#         "engine": {
#             "name": "Idun Agent Engine",
#             "version": __version__,
#             "description": "A framework for building and deploying conversational AI agents"
#         },
#         "server": {
#             "status": "running",
#             "endpoints": {
#                 "health": "/health",
#                 "docs": "/docs",
#                 "redoc": "/redoc",
#                 "agent_invoke": "/agent/invoke",
#                 "agent_stream": "/agent/stream"
#             }
#         }
#     }

#     # Add agent information if available in app state
#     if hasattr(request.app.state, "config") and request.app.state.config:
#         config = request.app.state.config
#         info["agent"] = {
#             "type": config.agent.type,
#             "name": config.agent.config.get("name", "Unknown"),
#             "status": "loaded"
#         }
#         info["server"]["port"] = config.server.api.port

#     return info
