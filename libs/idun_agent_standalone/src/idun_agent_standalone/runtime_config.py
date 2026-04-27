"""``GET /runtime-config.js`` bootstrap script.

The bundled UI is a Next.js export and cannot embed backend values at
build time, so the browser loads this script before the SPA bundle to
populate ``window.__IDUN_CONFIG__``. The UI reads ``authMode`` from
that object to decide whether to render the password gate.

The theme block here is a static default for the rework slice. A
proper theme resource lives behind a deferred admin route per the
design doc.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response

router = APIRouter(tags=["runtime-config"])

_LIGHT_COLORS: dict[str, str] = {
    "background": "#f7f6f0",
    "foreground": "#1d1c1a",
    "card": "#ffffff",
    "cardForeground": "#1d1c1a",
    "popover": "#ffffff",
    "popoverForeground": "#1d1c1a",
    "primary": "#1d1c1a",
    "primaryForeground": "#f7f6f0",
    "secondary": "#f0eee2",
    "secondaryForeground": "#1d1c1a",
    "muted": "#f0eee2",
    "mutedForeground": "#6b6a65",
    "accent": "#c96442",
    "accentForeground": "#ffffff",
    "destructive": "#dc2626",
    "destructiveForeground": "#ffffff",
    "border": "#e7e4d7",
    "input": "#e7e4d7",
    "ring": "rgba(201, 100, 66, 0.4)",
}

_DARK_COLORS: dict[str, str] = {
    "background": "#15140f",
    "foreground": "#f5f4ec",
    "card": "#1d1c1a",
    "cardForeground": "#f5f4ec",
    "popover": "#1d1c1a",
    "popoverForeground": "#f5f4ec",
    "primary": "#f5f4ec",
    "primaryForeground": "#15140f",
    "secondary": "#2a2925",
    "secondaryForeground": "#f5f4ec",
    "muted": "#2a2925",
    "mutedForeground": "#a1a097",
    "accent": "#d97757",
    "accentForeground": "#15140f",
    "destructive": "#ef4444",
    "destructiveForeground": "#f5f4ec",
    "border": "#2a2925",
    "input": "#2a2925",
    "ring": "rgba(217, 119, 87, 0.5)",
}

_DEFAULT_THEME: dict[str, Any] = {
    "appName": "Idun Agent",
    "greeting": "How can I help?",
    "starterPrompts": [],
    "logo": {"text": "IA"},
    "layout": "branded",
    "radius": "0.625",
    "fontSans": "",
    "fontSerif": "",
    "fontMono": "",
    "defaultColorScheme": "system",
    "colors": {"light": _LIGHT_COLORS, "dark": _DARK_COLORS},
}


@router.get("/runtime-config.js")
async def runtime_config_js(request: Request) -> Response:
    """Return a tiny script that seeds ``window.__IDUN_CONFIG__``."""
    settings = request.app.state.settings
    config: dict[str, Any] = {
        "theme": _DEFAULT_THEME,
        "authMode": settings.auth_mode.value,
        "layout": _DEFAULT_THEME["layout"],
    }
    body = f"window.__IDUN_CONFIG__ = {json.dumps(config)};\n"
    return Response(
        content=body,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )
