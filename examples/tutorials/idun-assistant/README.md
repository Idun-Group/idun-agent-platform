# LangGraph Dev Copilot

LangGraph dev copilot on Idun Engine. Combines four MCP servers, a managed system prompt, a Google Chat integration, and Langfuse observability into one example that exercises the full Idun feature surface.

## What it wires

| Feature | Source |
| --- | --- |
| MCP: `idun-docs` | `https://docs.idun-group.com/mcp` (streamable_http) |
| MCP: `atlassian` | `mcp-atlassian` via `uvx` (stdio) — Jira + Confluence |
| MCP: `github` | `ghcr.io/github/github-mcp-server` via `docker run` (stdio) |
| MCP: `google-workspace` | Separate `workspace-mcp` HTTP process |
| Managed prompt | `system_prompt` v1 |
| Integration | Google Chat |
| Observability | Langfuse |

The agent code patches `langchain-google-genai`'s tool-schema converter to handle MCP tools that emit array types without an `items` field (notably `mcp-atlassian`). The patch is preserved verbatim from the original implementation.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# OR set MODEL_PROVIDER=anthropic / openai and the matching key

# edit config.yaml: fill JIRA / CONFLUENCE / GITHUB tokens, point
# google-workspace at your running workspace-mcp instance, set the
# GOOGLE_CHAT credentials
pip install idun-agent-engine langgraph langchain-core langchain-google-genai
idun init
```

Open `http://localhost:8000`. Try:

- *"What do the idun docs say about managed prompts?"* — idun-docs MCP
- *"Show me my open Jira tickets in the SCRUM project."* — atlassian MCP
- *"List recent PRs in idun-agent-platform."* — github MCP

`http://localhost:8000/admin/mcp/` lists all four servers; click the wrench icon to probe each and see the advertised tools.

## Discord adapter

The upstream version of this copilot ships with a Discord adapter (`adapters/discord_bot.py`) that consumes the engine over HTTP. The adapter is not included here — this example focuses on the engine-side wiring (agent + MCP + integration + observability). Re-add it from the upstream repo if you need the Discord surface.
