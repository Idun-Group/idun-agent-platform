# MCP servers (LangGraph)

A minimal LangGraph chatbot that gains its tools from two remote MCP servers declared in `config.yaml`. The agent code itself contains zero tool definitions: every tool comes from the MCP registry the engine builds at boot.

MCP servers used here:

- **`docs-idun`** at `https://docs.idun-group.com/mcp` — Idun documentation MCP, lets the agent search the Idun docs from inside the conversation.
- **`data-gouv`** at `https://mcp.data.gouv.fr/mcp` — the French government open-data MCP, exposes search and metadata tools over `data.gouv.fr` datasets.

Both use the `streamable_http` transport, which is the default.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Browser opens at `http://localhost:8000`. Try prompts like:

- *"Search the Idun docs for `managed prompts`."*
- *"Find datasets about French unemployment statistics."*

## What to look for

- Boot log: `🔧 MCP Server docs-idun: [streamable_http]` and `🔧 MCP Server data-gouv: [streamable_http]`.
- `http://localhost:8000/admin/mcp/` lists both servers. Click the wrench icon next to either to probe and list the tools it advertises.
- The agent picks tools from EITHER server depending on the question, with no per-server routing code on your side.

## How it works

`get_langchain_tools_sync()` reads the engine's in-memory MCP registry (set by `server/lifespan.py` after `config.yaml` is parsed) and returns a flat list of LangChain `BaseTool` instances. `ChatGoogleGenerativeAI.bind_tools(tools)` binds them all to Gemini for tool calling. The `ToolNode` + `tools_condition` pattern routes Gemini's tool-call requests through ADK-style execution and feeds results back into the chat loop.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/mcp/helpers.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/mcp/helpers.py).
