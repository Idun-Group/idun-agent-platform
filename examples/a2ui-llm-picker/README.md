# A2UI LLM Travel Picker (WS3)

A LangGraph agent that uses Gemini Flash to propose 3 travel destinations as
A2UI v0.9 buttons; user picks one; agent acknowledges with an LLM-generated
two-paragraph pitch in a follow-up surface.

## Prerequisites

```bash
uv sync --extra examples         # installs langchain-google-genai
export GEMINI_API_KEY=<your-key>  # or GOOGLE_API_KEY
```

Optional: `export GEMINI_MODEL=gemini-2.5-flash` (or another available model)
to override the default.

## Run

Two terminals.

**1. Engine** (runs on port 8002):

```bash
idun agent serve --source file --path examples/a2ui-llm-picker/config.yaml
```

**2. Standalone-UI** — point it at the engine on `:8002`. The simplest path
mirrors the WS2 smoke test's `serve_smoke.py`; copy or adapt with the new
port. Or set the standalone wheel's `IDUN_AGENT_BASE_URL` to
`http://localhost:8002` and start the standalone server normally.

## Flow

1. Type a preference like "warm beach under $1500" or "city break with great
   food, mid-October".
2. The agent emits a Card with three Buttons (the LLM-generated options).
3. Click a destination → the agent emits a follow-up Card with a short pitch
   and an "Ask another question" button to start over.

## What it demonstrates

- LLM-generated A2UI surfaces (`with_structured_output(TravelProposal)`).
- Action round-trip with `name = "pick_destination"` and `context.destination`
  carrying the chosen option's full payload.
- Conditional entry-point routing (`propose` vs `acknowledge`) read off the
  typed `A2UIContext` returned by `idun_agent_engine.a2ui.read_a2ui_context`.

## Customize

- Change `GEMINI_MODEL` to swap LLM variants.
- Edit the system prompts in `agent.py` to retarget the picker to recipes,
  learning topics, or any other domain — the wire shape stays the same.
