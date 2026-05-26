# Managed prompts (Google ADK)

ADK chatbot whose `instruction` field is loaded from a **managed prompt** declared in `config.yaml`. The agent code never hardcodes the instruction text. Edit it in the admin panel at `/admin/prompts/` or bump the version in YAML and re-seed.

The example prompt has one Jinja2 variable `{{ role }}` and the agent fills it at module-load time with `"customer support agent"`.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine google-adk
idun init
```

Open `http://localhost:8000/admin/prompts/` to see the prompt library. Edit `system-prompt` v1, save, and the agent's next response reflects the new content.

## How it works

Same mechanism as the [LangGraph variant](../langgraph/README.md): `get_prompt(...)` reads from the engine's process-wide prompts snapshot. ADK consumes the rendered string via its `instruction` field, which is what the LLM sees as system context for every turn.

Sources:

- [`libs/idun_agent_engine/src/idun_agent_engine/prompts/helpers.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/prompts/helpers.py)
- [`libs/idun_agent_schema/src/idun_agent_schema/engine/prompt.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/prompt.py)
