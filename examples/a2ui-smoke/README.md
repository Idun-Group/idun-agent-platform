# WS2 A2UI smoke test

Verify visually that the standalone UI renders an A2UI v0.9 surface
when a LangGraph agent calls `emit_surface`. No LLM, no API keys —
the agent is deterministic.

## What you'll see

After sending any message in the chat:

- A short text summary in the assistant bubble (the markdown body)
- Below it, an A2UI **Basic Catalog showcase** rendered inside a
  Card: typography (h1–h5, body, caption), layout (Column, Row,
  Divider), inputs (TextField, CheckBox, Slider, DateTimeInput,
  ChoicePicker), visuals (Image, Icon), a Button, and a Tabs
  component. Inputs are interactive — they round-trip user edits
  via the surface dataModel.

## Files

- `agent.py` — LangGraph agent that calls `emit_surface` on every turn
- `config.yaml` — engine config pointing at `agent.py:graph`
- `serve_smoke.py` — tiny FastAPI proxy: serves the standalone-UI
  static export at `/` and forwards `POST /agent/run` to the engine
  on port 8001 (avoids needing the full standalone wheel + admin DB
  just to verify rendering)

## Run

Two terminals.

**1. Build the UI static export (one-time)**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
make build-standalone-ui
```

**2. Terminal A — engine on port 8001**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv run idun agent serve --source file --path examples/a2ui-smoke/config.yaml
```

Wait for `Application startup complete` / `Uvicorn running on http://0.0.0.0:8001`.

**3. Terminal B — UI proxy on port 8000**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv run python examples/a2ui-smoke/serve_smoke.py
```

**4. Browser**

Open http://localhost:8000/ → type any message → expect text + A2UI Card.

## Cleanup

`Ctrl+C` both terminals. Nothing persistent is created.

## Files outside this directory

None. The smoke test is self-contained — does not depend on the
standalone wheel, the admin DB, or any other repo state beyond the
built UI static export.

## Troubleshooting

- **Surface doesn't render but text does** → check the browser console
  for `[a2ui]` errors. The ErrorBoundary is silent by design; logs
  go to console.
- **`UI static export not found`** → run `make build-standalone-ui`
  first.
- **`emit_surface` raises** → make sure the engine is the one with
  WS2 changes (commit `8a774e59` or later). Check
  `idun_agent_engine/a2ui/__init__.py` exists.
- **Connection refused on port 8001** → start Terminal A first.
- **CORS errors** → not expected; the proxy and UI are same-origin.
- **Slow first response** → engine boots LangGraph + ag-ui-langgraph
  on first request; subsequent runs are fast.
