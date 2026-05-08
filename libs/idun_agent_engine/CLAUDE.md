# CLAUDE.md — Idun Agent Engine

## What this is

`idun_agent_engine` is a Python SDK that wraps agent frameworks (LangGraph, Google ADK, Haystack) into production-ready FastAPI services. Users define their agent and configuration, and the engine handles serving, streaming (AG-UI protocol via CopilotKit), memory, Langgraph checkpointing, observability, guardrails, and MCP tool management.

Published to PyPI as `idun-agent-engine`. The library is consumed programmatically via `create_app()` / `run_server()`; the `idun` CLI lives in the separate `idun_agent_standalone` package.

## Module map

<!-- VERIFY: regenerate from libs/idun_agent_engine/src/idun_agent_engine/ -->

```
idun_agent_engine/
├── core/               # Config resolution, app factory, server runner
│   ├── engine_config   # Re-exports Pydantic models from idun_agent_schema
│   ├── config_builder  # Central hub: loads YAML/dict/API, builds EngineConfig, initializes agents
│   ├── app_factory     # create_app() → FastAPI application
│   └── server_runner   # run_server() → uvicorn wrapper
├── agent/              # Framework adapters (all implement BaseAgent ABC)
│   ├── base            # BaseAgent protocol: initialize(), invoke(), stream(), copilotkit_agent_instance
│   ├── langgraph/      # Primary adapter. Full streaming (AG-UI events). Expects uncompiled StateGraph.
│   ├── adk/            # Google ADK adapter. Mature. Session + memory services. Stream not yet implemented.
│   └── haystack/       # Haystack adapter. Accepts Pipeline or Agent. Basic invoke only. Experimental.
├── server/             # FastAPI layer
│   ├── routers/agent   # /agent/capabilities, /agent/run, /agent/sessions, /agent/graph*, /agent/config
│   ├── routers/base    # /health, /reload, /_engine/info
│   ├── auth            # OIDCValidator — JWT validation via OIDC JWKS, require_auth dependency
│   ├── dependencies    # DI: get_agent, get_copilotkit_agent, get_mcp_registry
│   └── lifespan        # Startup: agent init, guardrails parsing, CopilotKit setup, SSO, telemetry
├── guardrails/         # Guardrails AI Hub integration
│   ├── base            # BaseGuardrail ABC: validate(input) → bool
│   └── guardrails_hub/ # Downloads + runs guards from guardrailsai hub. Blocks requests on violation.
├── observability/      # Provider-agnostic tracing
│   ├── base            # ObservabilityHandlerBase ABC, factory functions
│   ├── langfuse/       # LangChain CallbackHandler integration
│   ├── phoenix/        # OpenTelemetry + OpenInference instrumentation
│   ├── gcp_trace/      # Cloud Trace exporter + OpenInference instrumentation
│   └── gcp_logging/    # Google Cloud Logging (hooks into python logging)
├── integrations/       # Messaging/webhook provider integrations
│   ├── base            # BaseIntegration ABC, setup_integrations() factory, IntegrationProvider dispatch
│   ├── whatsapp/       # WhatsApp Cloud API: handler (webhook verify + receive), client (send_text_message)
│   └── discord/        # Discord Interactions Endpoint: handler (Ed25519 verify + slash commands),
│                       #   client (edit_interaction_response), verify (signature check), integration (app.state setup)
├── prompts/            # Prompt loading and helpers
│   ├── __init__        # Re-exports get_prompt
│   └── helpers         # get_prompt(), get_prompts(), get_prompts_from_file(), get_prompts_from_api()
├── mcp/                # MCP tool management
│   ├── registry        # MCPClientRegistry wrapping langchain-mcp-adapters MultiServerMCPClient
│   └── helpers         # get_langchain_tools(), get_adk_tools() — convenience functions
├── templates/          # Pre-built LangGraph agents (translation, correction, deep_research). Ignore.
└── telemetry/          # Anonymous usage telemetry (PostHog). Opt-out: IDUN_TELEMETRY_ENABLED=false. Tag deployment: IDUN_DEPLOYMENT_TYPE=cloud|self-hosted
```

## Public API

Exported from `idun_agent_engine.__init__`:

```python
from idun_agent_engine import (
    create_app,          # config → FastAPI app
    run_server,          # app → uvicorn
    run_server_from_config,   # config_path → app → uvicorn
    run_server_from_builder,  # ConfigBuilder → app → uvicorn
    ConfigBuilder,       # Fluent builder + static helpers for config loading/agent init
    BaseAgent,           # ABC for agent adapters
)
```

## Configuration Flow

A local YAML file is the primary boot source. The engine reads `config.yaml` → validates into `EngineConfig` (Pydantic) → builds the FastAPI app → serves.

Optional secondary path: `POST /reload` (and `prompts.helpers` / `mcp.helpers`) can fetch config from a remote manager API when `IDUN_AGENT_API_KEY` + `IDUN_MANAGER_HOST` are set. This is a hot-reload escape hatch, not the boot path — see Deferred features.

Config resolution priority in `ConfigBuilder.resolve_config()`:
1. `engine_config` (pre-validated EngineConfig)
2. `config_dict` (raw dict)
3. `config_path` (YAML file path)
4. Default `config.yaml`

### YAML Config Structure

Fields inside `agent.config` change depending on `agent.type`:

### Server API Settings

`server.api` currently exposes only `port`. Browser access behavior is built into the engine app factory:

- CORS remains wildcard (`allow_origins=["*"]`)
- Qualifying CORS preflights receive `Access-Control-Allow-Private-Network: true` so the hosted UI can reach a localhost agent from the browser

**LangGraph:**
```yaml
server:
  api:
    port: 8001

agent:
  type: "LANGGRAPH"
  config:
    name: "My Agent"
    graph_definition: "./agent.py:app"    # module_path:variable_name
    checkpointer:
      type: "sqlite"                      # sqlite | memory | postgres
      db_url: "sqlite:///checkpoint.db"

observability:                # top-level, not inside agent.config (agent-level is deprecated)
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "pk-..."
      secret_key: "sk-..."

guardrails:
  input:
    - config_id: "DETECT_PII"
      # ...
  output:
    - config_id: "TOXIC_LANGUAGE"
      # ...

mcp_servers:
  - name: "time"
    transport: "stdio"
    command: "docker"
    args: ["run", "-i", "--rm", "mcp/time"]

prompts:
  - prompt_id: "system-prompt"
    version: 1
    content: "You are a helpful assistant for {{ domain }}."
    tags: ["latest"]

sso:
  enabled: true
  issuer: "https://accounts.google.com"
  client_id: "123456.apps.googleusercontent.com"
  allowed_domains: ["company.com"]

integrations:
  - provider: "WHATSAPP"
    enabled: true
    config:
      access_token: "EAA..."
      phone_number_id: "123456"
      verify_token: "my-secret"
  - provider: "DISCORD"
    enabled: true
    config:
      bot_token: "MTI..."
      application_id: "123456789"
      public_key: "abcdef..."
```

**ADK:**
```yaml
agent:
  type: "ADK"
  config:
    name: "ADK Agent"
    app_name: "adk_agent"
    agent: "./agent.py:root_agent"        # module_path:variable_name (points to ADK agent)
    session_service:
      type: "in_memory"                   # in_memory | vertex_ai | database
    memory_service:
      type: "in_memory"                   # in_memory | vertex_ai
```

**Haystack:**
```yaml
agent:
  type: "HAYSTACK"
  config:
    name: "Haystack Agent"
    component_type: "pipeline"            # pipeline | agent
    component_definition: "./pipe.py:pipe"  # module_path:variable_name
```

## Agent Adapters

All adapters implement `BaseAgent` (generic ABC parameterized by config type).

All adapters implement `discover_capabilities()` (returns `AgentCapabilities`) and `run()` (canonical AG-UI interaction, delegates to framework AG-UI wrapper).

<!-- VERIFY: regenerate from libs/idun_agent_engine/src/idun_agent_engine/agent/ -->

| Adapter | Config Model | Graph Loading | Streaming | CopilotKit |
|---|---|---|---|---|
| **LanggraphAgent** | `LangGraphAgentConfig` | `graph_definition` → dynamic import → accepts `StateGraph` (preferred) or `CompiledStateGraph` (extracts `.builder`, recompiles with engine checkpointer/store, logs warning) | Full AG-UI event stream via `astream_events` | `LangGraphAGUIAgent` |
| **AdkAgent** | `AdkAgentConfig` | `agent` field → dynamic import | Not implemented | `ADKAGUIAgent` |
| **HaystackAgent** | `HaystackAgentConfig` | `component_definition` → dynamic import → `Pipeline` or `Agent` | Not implemented | Not supported |

### LangGraph: Key Details

- **`graph_definition`**: Format `path/to/file.py:variable_name`. Tries file path first, falls back to Python module import.
- **Checkpointers**: `InMemorySaver`, `AsyncSqliteSaver`, `AsyncPostgresSaver` — configured via YAML.
- **Streaming**: Maps LangGraph `astream_events(v2)` to AG-UI events (RunStarted, StepStarted, TextMessageStart/Content/End, ToolCallStart/Args/End, ThinkingStart/End, RunFinished).

### ADK: Key Details

- Session services: InMemory (default), VertexAI, Database (PostgreSQL).
- Memory services: InMemory (default), VertexAI.
- Langfuse observability via `GoogleADKInstrumentor` (OpenInference).

## Server Endpoints

<!-- VERIFY: regenerate from libs/idun_agent_engine/src/idun_agent_engine/server/routers/ -->

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Health check |
| `/reload` | POST | Hot-reload agent config without restarting the server |
| `/_engine/info` | GET | Engine introspection (version, capabilities, mounted endpoints) |
| `/agent/capabilities` | GET | Agent capability discovery (input/output schemas, supported modes) |
| `/agent/run` | POST | Canonical AG-UI interaction endpoint (accepts `RunAgentInput`, returns SSE) |
| `/agent/sessions` | GET | List session summaries from the active memory backend |
| `/agent/sessions/{session_id}` | GET | Fetch a single session's detail |
| `/agent/graph` | GET | Return the agent graph as `AgentGraph` |
| `/agent/graph/mermaid` | GET | Render the agent graph as Mermaid |
| `/agent/graph/ascii` | GET | Render the agent graph as ASCII |
| `/agent/config` | GET | Get current agent config |
| `/integrations/whatsapp/webhook` | GET/POST | WhatsApp webhook (GET: Meta verify, POST: receive messages) |
| `/integrations/discord/webhook` | POST | Discord Interactions Endpoint (Ed25519 verified, handles PING + slash commands) |

`/reload` is not currently protected by the SSO dependency used on `/agent/*` routes. Because engine CORS remains wildcard, any browser origin that can reach the agent can call `/reload` cross-origin as well.

## Guardrails

Uses [Guardrails AI Hub](https://hub.guardrailsai.com/). Guards are downloaded and run locally at startup. Requests are blocked (HTTP 429) if a guardrail triggers.

Available guards: `BanList`, `DetectPII`, `NSFWText`, `CompetitorCheck`, `BiasCheck`, `ValidLanguage`, `GibberishText`, `ToxicLanguage`, `RestrictToTopic`.

Guardrails are split into `input` (validated before agent invocation) and `output` (validated after).

## Observability

Top-level config. Multiple providers can be active simultaneously. All are lazy-loaded.

| Provider | Mechanism | Callbacks? |
|---|---|---|
| **Langfuse** | Sets env vars → `CallbackHandler` for LangChain | Yes |
| **Phoenix** | `phoenix.otel.register()` + `LangChainInstrumentor` | No (global instrumentation) |
| **GCP Trace** | `CloudTraceSpanExporter` + `LangChainInstrumentor` + optional Guardrails/VertexAI/MCP instrumentors | No (global instrumentation) |
| **GCP Logging** | `google.cloud.logging.Client.setup_logging()` | No (hooks into python logging) |

Config values support env var references: `${LANGFUSE_HOST}` syntax in YAML, resolved at load time.

## Prompts

`idun_agent_engine.prompts` provides helpers for loading `PromptConfig` entries from YAML files or the Manager API.

```python
from idun_agent_engine.prompts import get_prompt

prompt = get_prompt("system-prompt")           # returns PromptConfig | None
rendered = prompt.format(query="What is AI?")  # Jinja2 rendering
lc_prompt = prompt.to_langchain()              # LangChain PromptTemplate
```

Resolution priority in `get_prompts()`:
1. Explicit `config_path` argument
2. `IDUN_CONFIG_PATH` environment variable
3. Manager API (`IDUN_AGENT_API_KEY` + `IDUN_MANAGER_HOST` env vars)

`ConfigBuilder` also reads prompts from config and passes them through to `EngineConfig.prompts`.

## MCP (Model Context Protocol)

`MCPClientRegistry` wraps `langchain-mcp-adapters`'s `MultiServerMCPClient`. Configured via `mcp_servers` in YAML.

- Supports `stdio` transport (and SSE/HTTP for LangChain adapters).
- Provides `get_langchain_tools()` for LangGraph agents and `get_adk_toolsets()` for ADK agents.

## Key Dependencies

- `idun_agent_schema` — Shared Pydantic models (local editable dep)
- `langgraph`, `google-adk`, `haystack-ai` — Agent frameworks
- `copilotkit`, `ag-ui-core`, `ag-ui-encoder`, `ag-ui-adk` — AG-UI streaming protocol
- `langchain-mcp-adapters` — MCP client
- `guardrails-ai` — Guardrails hub
- `langfuse`, `arize-phoenix`, `opentelemetry-*`, `google-cloud-*` — Observability

## Tests

```bash
uv run pytest libs/idun_agent_engine/tests/ -v

# Skip tests requiring external services
uv run pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres"
```

Tests are split into `tests/unit/` (module-level) and `tests/integration/` (full-stack with the framework). Tests do not auto-load `.env`; export required vars in your shell before running.

## Conventions

- All agent operations are async (`initialize`, `invoke`, `stream`).
- Observability config is top-level in the YAML, not nested inside `agent.config` (agent-level is deprecated).
- Dynamic imports for agent loading: file path first, Python module fallback.
- `CompiledStateGraph` is **accepted** — the engine extracts `.builder` and recompiles with its own checkpointer/store. Compile options (`interrupt_before`/`interrupt_after`) are preserved. A warning is logged. Providing an uncompiled `StateGraph` is preferred. Note: `.builder` is an internal LangGraph attribute (verified on langgraph 1.x), not part of the public API.

## Deferred features

| Feature | Status | Notes |
| --- | --- | --- |
| `/agent/invoke` (POST) | Deprecated | Compatibility shim registered in `core/app_factory.py`. Use `/agent/run`. |
| `/agent/stream` (POST) | Deprecated | Marked `deprecated=True` in `server/routers/agent.py`. Use `/agent/run`. |
| `/agent/copilotkit/stream` (POST) | Deprecated | Marked `deprecated=True` in `server/routers/agent.py`. Use `/agent/run`. |
| Haystack adapter | Present | Lives in `agent/haystack/`. Basic invoke only; no streaming, no CopilotKit. Treat as experimental. |
| Manager-fetch config source | Present (secondary) | Hot-reload only via `POST /reload`, plus prompt/MCP helpers. Requires `IDUN_AGENT_API_KEY` + `IDUN_MANAGER_HOST`. Not the primary boot path. |
| Textual TUI (`idun init`) | Removed | Removed in commit `556e75a2` ("chore(engine): remove TUI and streamlit demo UI"). The `idun` CLI now lives in the separate `idun_agent_standalone` package. |
