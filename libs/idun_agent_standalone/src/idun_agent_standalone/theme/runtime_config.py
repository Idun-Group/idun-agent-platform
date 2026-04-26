"""``GET /runtime-config.js`` — backend-templated bootstrap script.

The static UI is a Next.js export and cannot embed backend-dependent values
at build time. The browser loads this script before the SPA's main bundle
to populate ``window.__IDUN_CONFIG__`` with the active theme and auth mode.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import select

from idun_agent_standalone.db.models import ThemeRow

router = APIRouter(tags=["runtime-config"])


class _CamelModel(BaseModel):
    """Pydantic base that serializes to camelCase (frontend convention)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ThemeColors(_CamelModel):
    background: str
    foreground: str
    card: str
    card_foreground: str
    popover: str
    popover_foreground: str
    primary: str
    primary_foreground: str
    secondary: str
    secondary_foreground: str
    muted: str
    muted_foreground: str
    accent: str
    accent_foreground: str
    destructive: str
    destructive_foreground: str
    border: str
    input: str
    ring: str


class LightDarkColors(_CamelModel):
    light: ThemeColors
    dark: ThemeColors


class ThemeLogo(_CamelModel):
    text: str
    image_url: str | None = None


class ThemeConfig(_CamelModel):
    app_name: str
    greeting: str
    starter_prompts: list[str]
    logo: ThemeLogo
    layout: str
    colors: LightDarkColors
    radius: str
    font_sans: str
    font_serif: str
    font_mono: str
    default_color_scheme: str


_EDITORIAL_LIGHT = ThemeColors(
    background="#f7f6f0",
    foreground="#1d1c1a",
    card="#ffffff",
    card_foreground="#1d1c1a",
    popover="#ffffff",
    popover_foreground="#1d1c1a",
    primary="#1d1c1a",
    primary_foreground="#f7f6f0",
    secondary="#f0eee2",
    secondary_foreground="#1d1c1a",
    muted="#f0eee2",
    muted_foreground="#6b6a65",
    accent="#c96442",
    accent_foreground="#ffffff",
    destructive="#dc2626",
    destructive_foreground="#ffffff",
    border="#e7e4d7",
    input="#e7e4d7",
    ring="rgba(201, 100, 66, 0.4)",
)


_EDITORIAL_DARK = ThemeColors(
    background="#15140f",
    foreground="#f5f4ec",
    card="#1d1c1a",
    card_foreground="#f5f4ec",
    popover="#1d1c1a",
    popover_foreground="#f5f4ec",
    primary="#f5f4ec",
    primary_foreground="#15140f",
    secondary="#2a2925",
    secondary_foreground="#f5f4ec",
    muted="#2a2925",
    muted_foreground="#a1a097",
    accent="#d97757",
    accent_foreground="#15140f",
    destructive="#ef4444",
    destructive_foreground="#f5f4ec",
    border="#2a2925",
    input="#2a2925",
    ring="rgba(217, 119, 87, 0.5)",
)


DEFAULT_THEME_MODEL = ThemeConfig(
    app_name="My Assistant",
    greeting="How can I help?",
    starter_prompts=[],
    logo=ThemeLogo(text="MA"),
    layout="branded",
    colors=LightDarkColors(light=_EDITORIAL_LIGHT, dark=_EDITORIAL_DARK),
    radius="0.625",
    font_sans="",
    font_serif="",
    font_mono="",
    default_color_scheme="system",
)


# ``DEFAULT_THEME`` is the camelCase JSON representation of the editorial
# default theme; ``window.__IDUN_CONFIG__.theme`` consumers expect this exact
# shape. Materializing it once at import time keeps the request path cheap.
DEFAULT_THEME: dict[str, Any] = DEFAULT_THEME_MODEL.model_dump(by_alias=True)


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
