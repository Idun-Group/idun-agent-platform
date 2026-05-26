# Examples

Two flavours of runnable example for Idun Engine:

- **Components** at the root of `examples/`: small, single-feature isolations. Each picks ONE part of the engine (MCP, guardrails, managed prompts, observability, memory, SSO, integrations) and shows the minimum config + agent code that exercises it. Every component has a `langgraph/` and an `adk/` variant.
- **Tutorials** under `examples/tutorials/`: larger, multi-feature demos that combine several pieces into one runnable agent.

## Components

| Component | LangGraph | ADK |
| --- | --- | --- |
| MCP servers | [`mcp/langgraph/`](./mcp/langgraph/) | [`mcp/adk/`](./mcp/adk/) |
| Guardrails | [`guardrails/langgraph/`](./guardrails/langgraph/) | [`guardrails/adk/`](./guardrails/adk/) |
| Managed prompts | [`prompts/langgraph/`](./prompts/langgraph/) | [`prompts/adk/`](./prompts/adk/) |
| Observability (Langfuse) | [`observability/langgraph/`](./observability/langgraph/) | [`observability/adk/`](./observability/adk/) |
| Memory (SQLite) | [`memory/langgraph/`](./memory/langgraph/) | [`memory/adk/`](./memory/adk/) |
| SSO (OIDC) | [`sso/langgraph/`](./sso/langgraph/) | [`sso/adk/`](./sso/adk/) |
| Slack integration | [`integrations/langgraph/`](./integrations/langgraph/) | [`integrations/adk/`](./integrations/adk/) |

SSO and integrations are config-only — the engine boots and registers the wiring, but exercising them end-to-end needs real OIDC / Slack credentials.

## Tutorials

| Tutorial | Framework | What it shows |
| --- | --- | --- |
| [`tutorials/deep-search-agent/`](./tutorials/deep-search-agent/) | Google ADK | Multi-agent research pipeline (plan / research / evaluate / refine / compose). Based on the Google ADK samples. |
| [`tutorials/text-to-sql-deep-agent/`](./tutorials/text-to-sql-deep-agent/) | LangChain Deep Agents | Natural-language to SQL agent over the Chinook database. Based on the LangChain Deep Agents text-to-sql example. |
| [`tutorials/idun-assistant/`](./tutorials/idun-assistant/) | LangGraph | LangGraph dev copilot: four MCP servers + managed prompt + Google Chat + Langfuse in one agent. |
| [`tutorials/langgraph-structured/`](./tutorials/langgraph-structured/) | LangGraph | Structured input/output schemas via an explicit `input_schema=` / `output_schema=` on the `StateGraph`. |
| [`tutorials/adk-structured/`](./tutorials/adk-structured/) | Google ADK | Structured input/output schemas via `input_schema` / `output_schema` on the ADK agent. |

## Running any example

Every example follows the same shape:

```bash
cd examples/<path-to-example>/
cp .env.example .env
# fill the keys per the example's README
uv sync                                  # or: pip install -e .
idun init
```

`idun init` runs DB migrations, seeds from `config.yaml`, opens a browser at `http://localhost:8000`, and boots the server with the chat UI and admin panel.

Each example ships with its own `pyproject.toml`, so dependencies install cleanly per example without bleeding into a shared environment.
