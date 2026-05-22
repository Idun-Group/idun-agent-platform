# MCP servers (Google ADK)

ADK agent that gains its tools from two remote MCP servers declared in `config.yaml`. Same two servers as the [LangGraph variant](../langgraph/README.md); only the agent code and `agent.type` differ.

MCP servers used here:

- **`docs-idun`** at `https://docs.idun-group.com/mcp` — Idun documentation MCP.
- **`data-gouv`** at `https://mcp.data.gouv.fr/mcp` — `data.gouv.fr` open data MCP.

Both use the `streamable_http` transport (default).

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine google-adk
idun init
```

Browser opens at `http://localhost:8000`. Try prompts like:

- *"Search the Idun docs for `managed prompts`."*
- *"Find datasets about French unemployment statistics."*

## What to look for

- Boot log: both MCP servers initialized + their tool counts.
- `http://localhost:8000/admin/mcp/` lists both servers. The wrench icon probes a server and lists every tool it advertises.

## How it works

`get_adk_tools()` reads the engine's in-memory MCP registry and returns ADK `McpToolset` instances. Pass them to `Agent(tools=...)` and ADK invokes them on the LLM's request. Unlike LangGraph, this helper is synchronous: ADK toolsets do their own lazy connection at first call.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/mcp/helpers.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/mcp/helpers.py).
