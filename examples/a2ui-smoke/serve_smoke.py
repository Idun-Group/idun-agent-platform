"""WS2 A2UI smoke-test proxy server.

Serves the standalone-UI static export at ``/`` and proxies
``POST /agent/run`` to the engine running on port 8001. Stubs
``/runtime-config.js`` so the UI activates with sensible defaults.

This avoids needing the full standalone wheel + admin DB just to
visually verify A2UI rendering.

Usage (two terminals)::

    # Terminal 1 — engine on port 8001
    cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
    uv run idun agent serve --source file --path examples/a2ui-smoke/config.yaml

    # Terminal 2 — UI proxy on port 8000
    cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
    uv run python examples/a2ui-smoke/serve_smoke.py

Then open http://localhost:8000/ and send any message.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

REPO_ROOT = Path(__file__).resolve().parents[2]
UI_OUT = REPO_ROOT / "services/idun_agent_standalone_ui/out"
ENGINE_URL = "http://127.0.0.1:8001"


_RUNTIME_CONFIG_JS = """\
window.__IDUN_CONFIG__ = {
  authMode: "none",
  layout: "branded",
  theme: {
    appName: "A2UI Smoke Test",
    greeting: "Type any message to render an A2UI surface",
    starterPrompts: ["Find me coffee shops in NYC"],
    logo: { text: "A2" },
    layout: "branded",
    colors: {
      light: {
        background: "#f7f6f0", foreground: "#1d1c1a",
        card: "#ffffff", cardForeground: "#1d1c1a",
        popover: "#ffffff", popoverForeground: "#1d1c1a",
        primary: "#1d1c1a", primaryForeground: "#f7f6f0",
        secondary: "#f0eee2", secondaryForeground: "#1d1c1a",
        muted: "#f0eee2", mutedForeground: "#6b6a65",
        accent: "#8c52ff", accentForeground: "#ffffff",
        destructive: "#dc2626", destructiveForeground: "#ffffff",
        border: "#e7e4d7", input: "#e7e4d7",
        ring: "rgba(140, 82, 255, 0.4)"
      },
      dark: {
        background: "#15140f", foreground: "#f5f4ec",
        card: "#1d1c1a", cardForeground: "#f5f4ec",
        popover: "#1d1c1a", popoverForeground: "#f5f4ec",
        primary: "#f5f4ec", primaryForeground: "#15140f",
        secondary: "#2a2925", secondaryForeground: "#f5f4ec",
        muted: "#2a2925", mutedForeground: "#a1a097",
        accent: "#8c52ff", accentForeground: "#ffffff",
        destructive: "#ef4444", destructiveForeground: "#f5f4ec",
        border: "#2a2925", input: "#2a2925",
        ring: "rgba(140, 82, 255, 0.5)"
      }
    },
    radius: "0.625",
    fontSans: "", fontSerif: "", fontMono: "",
    defaultColorScheme: "light"
  }
};
"""


app = FastAPI()


@app.get("/runtime-config.js")
async def runtime_config() -> Response:
    return Response(_RUNTIME_CONFIG_JS, media_type="application/javascript")


@app.post("/agent/run")
async def proxy_agent_run(request: Request) -> StreamingResponse:
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "connection")
    }

    client = httpx.AsyncClient(timeout=None)
    upstream_request = client.build_request(
        "POST", f"{ENGINE_URL}/agent/run", content=body, headers=headers
    )
    upstream = await client.send(upstream_request, stream=True)

    async def stream():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "text/event-stream"),
    )


# Static UI mount LAST so the API routes above take precedence.
if UI_OUT.is_dir() and (UI_OUT / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(UI_OUT), html=True), name="ui")
else:

    @app.get("/")
    async def missing_ui() -> Response:
        return Response(
            (
                f"UI static export not found at {UI_OUT}.\n"
                "Run `make build-standalone-ui` from the repo root, then retry."
            ),
            status_code=503,
            media_type="text/plain",
        )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
