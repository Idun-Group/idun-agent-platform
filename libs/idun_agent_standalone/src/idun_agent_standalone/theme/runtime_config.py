"""``GET /runtime-config.js`` — backend-templated bootstrap script.

The static UI is a Next.js export and cannot embed backend-dependent values
at build time. The browser loads this script before the SPA's main bundle
to populate ``window.__IDUN_CONFIG__`` with the active theme and auth mode.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from idun_agent_standalone.db.models import ThemeRow

router = APIRouter(tags=["runtime-config"])


DEFAULT_THEME: dict[str, Any] = {
    "appName": "My Assistant",
    "greeting": "How can I help?",
    "starterPrompts": [],
    "logo": {"text": "MA"},
    "layout": "branded",
    "colors": {
        "light": {
            "primary": "#4f46e5",
            "accent": "#7c3aed",
            "background": "#ffffff",
            "foreground": "#0a0a0a",
            "muted": "#f5f5f5",
            "border": "#e5e7eb",
        },
        "dark": {
            "primary": "#818cf8",
            "accent": "#a78bfa",
            "background": "#0a0a0a",
            "foreground": "#fafafa",
            "muted": "#1f1f1f",
            "border": "#262626",
        },
    },
    "radius": "0.5",
    "fontFamily": "system",
    "defaultColorScheme": "system",
}


@router.get("/runtime-config.js")
async def runtime_config_js(request: Request) -> Response:
    sm = request.app.state.sessionmaker
    settings = request.app.state.settings
    async with sm() as s:
        row = (await s.execute(select(ThemeRow))).scalar_one_or_none()
    theme: dict[str, Any] = {
        **DEFAULT_THEME,
        **((row.config or {}) if row else {}),
    }

    config: dict[str, Any] = {
        "theme": theme,
        "authMode": settings.auth_mode.value,
        "layout": theme.get("layout", "branded"),
    }
    body = f"window.__IDUN_CONFIG__ = {json.dumps(config)};\n"
    return Response(
        content=body,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )
