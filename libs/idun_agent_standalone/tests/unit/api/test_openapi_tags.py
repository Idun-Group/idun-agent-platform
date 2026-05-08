"""Verify the standalone OpenAPI surface clusters into the 5 declared tags."""

from __future__ import annotations

from fastapi import FastAPI
from idun_agent_engine.integrations.discord.handler import router as discord_router
from idun_agent_engine.integrations.google_chat.handler import (
    router as google_chat_router,
)
from idun_agent_engine.integrations.slack.handler import router as slack_router
from idun_agent_engine.integrations.teams.handler import router as teams_router
from idun_agent_engine.integrations.whatsapp.handler import router as whatsapp_router
from idun_agent_engine.server.routers.agent import agent_router as engine_agent_router
from idun_agent_engine.server.routers.base import base_router as engine_base_router
from idun_agent_standalone.api.v1._register import register_standalone_routers
from idun_agent_standalone.api.v1.openapi import OPENAPI_TAG_NAMES, OPENAPI_TAGS


def _build_test_app() -> FastAPI:
    """Mirror of standalone include_router wiring without lifespan/DB."""
    app = FastAPI(openapi_tags=OPENAPI_TAGS)
    # Engine routes (mounted by create_engine_app in production)
    app.include_router(engine_agent_router, prefix="/agent")
    app.include_router(engine_base_router)
    # Engine chat-channel webhooks (each mounted by integration.attach in
    # production when configured — we mount them all here so the test
    # catches tagging regressions even when no integration is enabled).
    app.include_router(discord_router, prefix="/integrations/discord")
    app.include_router(google_chat_router, prefix="/integrations/google-chat")
    app.include_router(slack_router, prefix="/integrations/slack")
    app.include_router(teams_router, prefix="/integrations/teams")
    app.include_router(whatsapp_router, prefix="/integrations/whatsapp")
    # Standalone admin + public routes — single source of truth shared
    # with create_standalone_app.
    register_standalone_routers(app)
    return app


def test_openapi_tags_metadata_exposed() -> None:
    """The /docs page sees the 5 declared groups in declared order."""
    app = _build_test_app()
    schema = app.openapi()
    assert schema["tags"] == [
        {"name": t["name"], "description": t["description"]} for t in OPENAPI_TAGS
    ]


def test_no_orphan_operations() -> None:
    """Every operation must belong to one of the 5 declared tags."""
    app = _build_test_app()
    schema = app.openapi()
    seen_unknown: dict[str, list[str]] = {}
    for path, methods in schema["paths"].items():
        for method, op in methods.items():
            tags = op.get("tags") or []
            unknown = [t for t in tags if t not in OPENAPI_TAG_NAMES]
            if unknown or not tags:
                seen_unknown.setdefault(f"{method.upper()} {path}", []).extend(
                    unknown if unknown else ["<no tag>"]
                )
    assert not seen_unknown, f"Operations with unknown or missing tags: {seen_unknown}"


def test_every_tag_has_at_least_one_operation() -> None:
    """No declared tag should orphan a whole bundle."""
    app = _build_test_app()
    schema = app.openapi()
    used: set[str] = set()
    for methods in schema["paths"].values():
        for op in methods.values():
            used.update(op.get("tags") or [])
    missing = OPENAPI_TAG_NAMES - used
    assert not missing, f"Tags declared in OPENAPI_TAGS but unused: {missing}"
