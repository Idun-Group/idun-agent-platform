# Managed prompts (LangGraph)

LangGraph chatbot whose system prompt is loaded from a **managed prompt** declared in `config.yaml`. The agent code never hardcodes the prompt text. Edit the prompt in the admin panel at `/admin/prompts/` (or bump the version in YAML and re-seed) and the running agent picks up the new content on next reload.

The example prompt has one Jinja2 variable `{{ role }}` and the agent fills it at module-load time with `"customer support agent"`.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Open `http://localhost:8000`, then visit `http://localhost:8000/admin/prompts/`. You will see `system-prompt` v1 in the library. Edit the body and save; the assistant's next reply reflects the new prompt.

## How it works

`get_prompt("system-prompt")` returns a `PromptConfig` with a `.format(**vars)` method that renders Jinja2 variables in sandboxed mode. The resolution order is:

1. The engine's process-wide prompts snapshot (set by the standalone's reload pipeline, or by the engine's own bootstrap from `config.yaml`).
2. `IDUN_CONFIG_PATH` YAML file (engine-only mode).
3. The Idun Manager API (when `IDUN_AGENT_API_KEY` / `IDUN_MANAGER_HOST` are set).

Sources:

- [`libs/idun_agent_engine/src/idun_agent_engine/prompts/helpers.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/prompts/helpers.py)
- [`libs/idun_agent_schema/src/idun_agent_schema/engine/prompt.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/prompt.py)
