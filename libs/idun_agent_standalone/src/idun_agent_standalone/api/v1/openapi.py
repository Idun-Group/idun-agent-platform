"""OpenAPI tag metadata for the standalone runtime.

Drives section ordering and per-section descriptions shown in
``/docs`` (Swagger UI) and ``/redoc``. Wired in
``idun_agent_standalone.app.create_standalone_app`` immediately after
the engine app is constructed, so the engine API surface stays
unchanged across embedders.
"""

from __future__ import annotations

OPENAPI_TAGS: list[dict[str, str]] = [
    {
        "name": "Runtime",
        "description": (
            "Public agent run endpoints, engine operations, and chat-channel "
            "webhooks. SSE streaming via the AG-UI protocol."
        ),
    },
    {
        "name": "Agent Configuration",
        "description": (
            "Singleton admin endpoints for the agent, prompts, memory, "
            "guardrails, and onboarding wizard."
        ),
    },
    {
        "name": "Auth & SSO",
        "description": (
            "Login, sessions, password change, SSO config, and the public "
            "SSO discovery endpoint."
        ),
    },
    {
        "name": "Integrations & Tools",
        "description": ("MCP server registry and external integration credentials."),
    },
    {
        "name": "Observability",
        "description": "Tracing/logging provider configuration.",
    },
]
"""Ordered tag groups exposed in /docs. Order = display order."""

OPENAPI_TAG_NAMES: frozenset[str] = frozenset(t["name"] for t in OPENAPI_TAGS)
"""Allowed tag names — used by the no-orphan-operations test."""
