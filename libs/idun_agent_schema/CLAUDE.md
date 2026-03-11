# CLAUDE.md — Idun Agent Schema

## What This Is

`idun_agent_schema` is the **centralized Pydantic model library** shared across the entire Idun Agent Platform. It defines the data contracts between the engine, the manager, and the web UI. Every config structure, API payload, and managed resource schema lives here.

Published to PyPI as `idun-agent-schema`. Minimal dependencies: `pydantic` + `pydantic-settings` only.

**This is the source of truth for all data shapes.** Schema changes start here, then propagate to engine and manager.

## Package Structure

Three namespaces, each with its own `__init__.py`:

```
idun_agent_schema/
├── engine/          # Schemas consumed by idun_agent_engine (config YAML → Pydantic)
├── manager/         # Schemas consumed by idun_agent_manager (API request/response models)
└── shared/          # Cross-cutting base classes
```

## Engine Schemas (`engine/`)

These models define the YAML config structure that the engine parses.

### Core Config Hierarchy

```
EngineConfig                    # Top-level config (engine/engine.py)
├── server: ServerConfig        # Server settings (engine/server.py)
│   └── api: ServerAPIConfig    #   port (default 8000)
├── agent: AgentConfig          # Agent definition (engine/agent.py)
│   ├── type: AgentFramework    #   LANGGRAPH | ADK | HAYSTACK | ...
│   └── config: <framework-specific config>
├── observability: list[ObservabilityConfig]  # (engine/observability_v2.py)
├── guardrails: GuardrailsV2    # (engine/guardrails_v2.py)
├── mcp_servers: list[MCPServer]  # (engine/mcp_server.py)
├── sso: SSOConfig | None      # (engine/sso.py) — OIDC JWT validation on protected routes
└── integrations: list[IntegrationConfig] | None  # (engine/integrations/) — WhatsApp, Discord
```

### Agent Framework Configs

All extend `BaseAgentConfig` (`engine/base_agent.py`):

| Config | Module | Key Fields |
|---|---|---|
| `BaseAgentConfig` | `base_agent.py` | `name`, `input_schema_definition`, `output_schema_definition`, `observability` (deprecated) |
| `LangGraphAgentConfig` | `langgraph.py` | `graph_definition` (str), `checkpointer` (CheckpointConfig), `store` |
| `AdkAgentConfig` | `adk.py` | `agent` (str), `app_name`, `session_service`, `memory_service` |
| `HaystackAgentConfig` | `haystack.py` | `component_type` (pipeline\|agent), `component_definition` (str) |

**`AgentFramework`** enum (`agent_framework.py`): `LANGGRAPH`, `ADK`, `HAYSTACK`, `CREWAI`, `CUSTOM`, `TRANSLATION_AGENT`, `CORRECTION_AGENT`, `DEEP_RESEARCH_AGENT`

**`AgentConfig`** (`agent.py`) uses a model validator to enforce that `config` type matches `type` (e.g. `LANGGRAPH` → `LangGraphAgentConfig`).

### Checkpointer Configs (LangGraph)

Discriminated union `CheckpointConfig` in `langgraph.py`:

- `SqliteCheckpointConfig` — `type: "sqlite"`, `db_url` (validated: must start with `sqlite:///`)
- `InMemoryCheckpointConfig` — `type: "memory"`
- `PostgresCheckpointConfig` — `type: "postgres"`, `db_url` (validated: must start with `postgresql://` or `postgres://`)

### ADK Service Configs

Discriminated unions in `adk.py` (discriminator: `type` field):

**Session services** (`SessionServiceConfig`):
- `AdkInMemorySessionConfig` — `type: "in_memory"`
- `AdkVertexAiSessionConfig` — `type: "vertex_ai"`, `project_id`, `location`, `reasoning_engine_app_name`
- `AdkDatabaseSessionConfig` — `type: "database"`, `db_url`

**Memory services** (`MemoryServiceConfig`):
- `AdkInMemoryMemoryConfig` — `type: "in_memory"`
- `AdkVertexAiMemoryConfig` — `type: "vertex_ai"`, `project_id`, `location`, `memory_bank_id`

### Observability

Two versions exist:

- **V1** (`observability.py`): `provider` (str), `enabled`, `options` (dict). Supports `${VAR}` env var resolution via `_resolve_env()` and `.resolved()`. Used by agent-level config (deprecated).
- **V2** (`observability_v2.py`): `provider` (enum `ObservabilityProvider`), `enabled`, `config` (typed union). Used at top-level `EngineConfig.observability`. **This is the current standard.**

**`ObservabilityProvider`** enum: `LANGFUSE`, `PHOENIX`, `GCP_LOGGING`, `GCP_TRACE`, `LANGSMITH`

Provider-specific config models: `LangfuseConfig`, `PhoenixConfig`, `GCPLoggingConfig`, `GCPTraceConfig`, `LangsmithConfig`

### Guardrails

Two versions exist:

- **V1** (`guardrails.py`): `Guardrails` model with `enabled` flag + `input`/`output` lists of `Guardrail` (type + config dict). Uses `GuardrailType` enum (`CUSTOM_LLM`, `GUARDRAILS_HUB`).
- **V2** (`guardrails_v2.py`): `GuardrailsV2` model with typed config models per guard. **This is the current standard** (used by `EngineConfig`).

**`GuardrailConfigId`** enum: `BAN_LIST`, `DETECT_PII`, `NSFW_TEXT`, `COMPETITION_CHECK`, `BIAS_CHECK`, `CORRECT_LANGUAGE`, `GIBBERISH_TEXT`, `TOXIC_LANGUAGE`, `RESTRICT_TO_TOPIC`, `DETECT_JAILBREAK`, `PROMPT_INJECTION`, `RAG_HALLUCINATION`, `CODE_SCANNER`, `MODEL_ARMOR`, `CUSTOM_LLM`

Each guard has its own typed config (e.g. `BanListConfig`, `DetectPIIConfig`, `ToxicLanguageConfig`), including `api_key`, `guard_url`, `reject_message`, and guard-specific params.

### Integrations (`engine/integrations/`)

Provider-specific integration configs for messaging/webhook channels.

**`base.py`**: `IntegrationProvider` enum (`WHATSAPP`, `DISCORD`), `IntegrationConfig` model with `provider`, `enabled`, and `config` (union of provider configs, coerced via `_coerce_config_type` model validator).

**`whatsapp.py`**: `WhatsAppIntegrationConfig` — `access_token`, `phone_number_id`, `verify_token`, `api_version` (default `"v21.0"`).

**`discord.py`**: `DiscordIntegrationConfig` — `bot_token`, `application_id`, `public_key` (Ed25519 hex), optional `guild_id`.

**`discord_webhook.py`**: Pydantic models for Discord Interactions Endpoint payloads — `InteractionType` (IntEnum: PING=1, APPLICATION_COMMAND=2), `InteractionResponseType` (IntEnum: PONG=1, DEFERRED=5), `DiscordInteraction` (with `resolve_user_id()` and `extract_command_text()` methods). Note: `DiscordInteraction.type` is `int` (not enum) to accept unknown interaction types from Discord.

### SSO

`SSOConfig` (`engine/sso.py`): OIDC Single Sign-On configuration for engine route protection. When enabled, the engine validates JWT tokens on protected routes (`/agent/invoke`, `/agent/stream`, `/agent/copilotkit/stream`) against the OIDC provider's JWKS endpoint. Fields: `enabled`, `issuer`, `client_id`, `audience` (optional, defaults to `client_id`), `allowed_domains`, `allowed_emails`.

### MCP Server

`MCPServer` (`mcp_server.py`): Full MCP server connection config.
- `transport`: `stdio` | `sse` | `streamable_http` | `websocket`
- `url` (required for HTTP transports), `command` + `args` (required for stdio)
- `headers`, `env`, `cwd`, `encoding`, timeout settings, `session_kwargs`
- `as_connection_dict()`: Converts to `langchain-mcp-adapters` connection payload
- Model validator enforces transport-specific required fields

Uses camelCase aliases (`ConfigDict(alias_generator=to_camel, populate_by_name=True)`).

### API Payloads

`ChatRequest` / `ChatResponse` (`api.py`): Default request/response for `/agent/invoke` when no custom `input_schema_definition` is set. Fields: `session_id`, `query` / `response`.

### Templates

`templates.py`: `TranslationAgentConfig`, `CorrectionAgentConfig`, `DeepResearchAgentConfig` — extend `LangGraphAgentConfig` or `BaseAgentConfig`. Ignore these.

## Manager Schemas (`manager/`)

CRUD models for resources managed via the manager API. Each follows the pattern: `Create`, `Read`, `Patch`.

| Resource | Module | Key Fields |
|---|---|---|
| **Agent** | `managed_agent.py` | `name`, `status` (`AgentStatus` enum), `version`, `base_url`, `engine_config` (full `EngineConfig`) |
| **Guardrail** | `managed_guardrail.py` | `name`, `guardrail` (`ManagerGuardrailConfig`) |
| **MCP Server** | `managed_mcp_server.py` | `name`, `mcp_server` (`MCPServer`) |
| **Memory** | `managed_memory.py` | `name`, `agent_framework`, `memory` (`CheckpointConfig \| SessionServiceConfig`) |
| **Observability** | `managed_observability.py` | `name`, `observability` (`ObservabilityConfig` V2) |
| **SSO** | `managed_sso.py` | `name`, `sso` (`SSOConfig`) |
| **Integration** | `managed_integration.py` | `name`, `integration` (`IntegrationConfig`) |
| **API Key** | `api.py` | `api_key` (str) |

**`AgentStatus`** enum: `DRAFT`, `ACTIVE`, `INACTIVE`, `DEPRECATED`, `ERROR`

**`guardrail_configs.py`**: Manager-specific simplified guardrail configs (`SimpleBanListConfig`, `SimplePIIConfig`) + `convert_guardrail()` function that converts manager-format guardrails into engine-format (adds `api_key` from `GUARDRAILS_API_KEY` env var, maps PII entity names, builds `guard_params`).

## Shared (`shared/`)

`SharedBaseModel` (`shared/base.py`): `pydantic-settings` `BaseSettings` subclass with camelCase alias generation and env var fallback. For models that need both frontend-friendly JSON keys and env var population.

## Conventions

- **CamelCase aliases**: Most models use `ConfigDict(alias_generator=to_camel, populate_by_name=True)` for frontend compatibility. Fields accept both `snake_case` and `camelCase`.
- **Discriminated unions**: Used for checkpointer configs (`type` field), ADK session/memory configs (`type` field).
- **Env var resolution**: V1 observability supports `${VAR}` syntax in YAML values, resolved via `_resolve_env()`.
- **Schema changes flow**: Change here first → update engine/manager consumers → update frontend generated types.
- **Pydantic 2.11+**: Uses `model_validator`, `field_validator`, `ConfigDict`, `Field` with `alias`.
- **No runtime dependencies beyond Pydantic**: This package must stay lightweight — no framework imports.

## Development

```bash
# Lint
uv run ruff check libs/idun_agent_schema/

# Format
uv run black libs/idun_agent_schema/

# Type check
cd libs/idun_agent_schema && uv run mypy src/
```
