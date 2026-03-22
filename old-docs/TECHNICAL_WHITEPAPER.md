# Idun Agent Platform — Technical Whitepaper

**Version 0.5.0 | March 2026**

---

## Executive Summary

Idun Agent Platform is an open-source control plane that transforms AI agent prototypes into governed, production-ready services. It provides a unified runtime, management layer, and admin interface for deploying agents built with LangGraph, Google ADK, or Haystack — on your own infrastructure.

The platform addresses a critical gap in the AI agent ecosystem: while frameworks for building agents are maturing rapidly, the operational infrastructure for deploying, monitoring, securing, and governing them at scale remains fragmented. Each framework ships its own deployment patterns, observability hooks, and operational tooling — forcing teams to rebuild infrastructure for every new agent.

Idun solves this by providing one configuration model, one API surface, and one management plane across all supported frameworks.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Components](#2-system-components)
3. [Agent Engine (Runtime Layer)](#3-agent-engine-runtime-layer)
4. [Agent Manager (Control Plane)](#4-agent-manager-control-plane)
5. [Agent Schema (Data Contract Layer)](#5-agent-schema-data-contract-layer)
6. [Web Dashboard (Admin Interface)](#6-web-dashboard-admin-interface)
7. [Configuration System](#7-configuration-system)
8. [Agent Framework Adapters](#8-agent-framework-adapters)
9. [Streaming and AG-UI Protocol](#9-streaming-and-ag-ui-protocol)
10. [Observability](#10-observability)
11. [Guardrails](#11-guardrails)
12. [MCP Tool Management](#12-mcp-tool-management)
13. [Memory and State Persistence](#13-memory-and-state-persistence)
14. [Authentication and Multi-Tenancy](#14-authentication-and-multi-tenancy)
15. [Messaging Integrations](#15-messaging-integrations)
16. [Prompt Management](#16-prompt-management)
17. [Deployment Architecture](#17-deployment-architecture)
18. [Scalability and Performance](#18-scalability-and-performance)
19. [Security Model](#19-security-model)
20. [Technology Stack](#20-technology-stack)
21. [Roadmap](#21-roadmap)

---

## 1. Architecture Overview

The platform follows a three-layer architecture with clear separation of concerns:

```
┌──────────────────────────────────────────────────────────┐
│                  Client Applications                      │
│        (Web Dashboard, Mobile, CLI, API Consumers)        │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP/REST + SSE Streaming
                      ▼
┌──────────────────────────────────────────────────────────┐
│              Idun Agent Manager (Optional)                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  REST API  │  Web UI  │  Auth (OIDC + Basic)      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  PostgreSQL (Configs, API Keys, Workspaces, Users) │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────┘
                      │ Config Retrieval via API Key
                      ▼
┌──────────────────────────────────────────────────────────┐
│                  Idun Agent Engine                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │  FastAPI Server  │  Config Loader  │  SSO/JWT      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Observability  │  Guardrails  │  MCP  │  Prompts  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Framework Adapters                                │  │
│  │  LangGraph  │  Google ADK  │  Haystack             │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│              External Services & Storage                  │
│   LLMs  │  Databases  │  Vector Stores  │  MCP Servers   │
└──────────────────────────────────────────────────────────┘
```

The Manager is optional. Agents can run standalone using a local YAML config file, or can be centrally managed through the Manager's API and database.

---

## 2. System Components

| Component | Package | Role | Published |
|-----------|---------|------|-----------|
| **Agent Schema** | `idun-agent-schema` | Shared Pydantic data models | PyPI |
| **Agent Engine** | `idun-agent-engine` | Runtime SDK wrapping agents into FastAPI services | PyPI |
| **Agent Manager** | `idun_agent_manager` | FastAPI + PostgreSQL control plane | Docker image |
| **Agent Web** | `idun_agent_web` | React 19 admin dashboard | Docker image |
| **Platform CLI** | `idun` (CLI entry point) | Click + Textual TUI for agent management | Bundled with Engine |

---

## 3. Agent Engine (Runtime Layer)

The Engine is the core runtime that loads agent code, wraps it into a FastAPI service, and provides a unified API surface regardless of the underlying agent framework.

### Module Architecture

```
idun_agent_engine/
├── core/               # Config resolution, app factory, server runner
│   ├── config_builder  # Central hub: loads YAML/dict/API, builds EngineConfig
│   ├── app_factory     # create_app() → FastAPI application
│   └── server_runner   # run_server() → uvicorn wrapper
├── agent/              # Framework adapters (BaseAgent ABC)
│   ├── langgraph/      # Primary adapter — full AG-UI streaming
│   ├── adk/            # Google ADK adapter — session + memory services
│   └── haystack/       # Haystack adapter — pipeline/agent (experimental)
├── server/             # FastAPI layer (routers, auth, dependencies, lifespan)
├── guardrails/         # Guardrails AI Hub integration
├── observability/      # Provider-agnostic tracing (Langfuse, Phoenix, GCP, LangSmith)
├── integrations/       # Messaging channels (WhatsApp, Discord)
├── mcp/                # MCP tool registry (langchain-mcp-adapters)
├── prompts/            # Prompt loading and Jinja2 rendering
└── telemetry/          # Anonymous usage telemetry (opt-out)
```

### Public API

```python
from idun_agent_engine import (
    create_app,                # config → FastAPI app
    run_server,                # app → uvicorn
    run_server_from_config,    # config_path → app → uvicorn
    run_server_from_builder,   # ConfigBuilder → app → uvicorn
    ConfigBuilder,             # Fluent builder for config loading
    BaseAgent,                 # ABC for agent adapters
)
```

### REST Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/docs` | GET | OpenAPI documentation |
| `/reload` | POST | Hot-reload agent config without restart |
| `/agent/capabilities` | GET | Agent capability discovery (schemas, modes) |
| `/agent/run` | POST | Canonical AG-UI interaction (SSE stream) |
| `/agent/config` | GET | Current agent configuration |
| `/integrations/whatsapp/webhook` | GET/POST | WhatsApp Cloud API webhook |
| `/integrations/discord/webhook` | POST | Discord Interactions Endpoint |

### Request Processing Pipeline

```
HTTP Request
    → SSO/JWT Authentication (if enabled)
    → Input Guardrails (sequential validation)
    → Framework Adapter (LangGraph/ADK/Haystack)
    → Output Guardrails (sequential validation)
    → SSE Response Stream (AG-UI events)
```

If any guardrail triggers, the request is blocked with HTTP 429 and a configurable rejection message.

---

## 4. Agent Manager (Control Plane)

The Manager provides centralized CRUD operations for agents and all associated resources through a multi-tenant workspace model.

### API Surface

All resource routes are prefixed with `/api/v1/` and scoped to the active workspace.

| Route Prefix | Description |
|-------------|-------------|
| `/auth` | Login, signup, logout, OIDC callback, session |
| `/agents` | Agent CRUD, API key generation, config endpoint |
| `/prompts` | Versioned prompt CRUD, agent assignment |
| `/guardrails` | Guardrail config CRUD |
| `/mcp-servers` | MCP server config CRUD |
| `/observability` | Observability config CRUD |
| `/memory` | Memory/checkpoint config CRUD |
| `/sso` | SSO/OIDC config CRUD |
| `/integrations` | Messaging integration config CRUD |
| `/workspaces` | Workspace CRUD |
| `/agent-frameworks` | List supported frameworks |
| Health endpoints | `/healthz`, `/readyz`, `/version` |

### Materialized Config Pattern

The Manager stores a fully assembled `engine_config` as a JSONB column on each agent record. This is a pre-computed snapshot identical to what the Engine expects.

**Write path**: Agent create/update triggers `sync_resources()` + `recompute_engine_config()`. When a linked resource is updated, all referencing agents are automatically recomputed.

**Read path**: `GET /agents/config` returns the JSONB directly — zero JOINs, instant reads. The Engine is unaffected by the relational model.

### Resource Relationship Model

| Relation | Type | Mechanism |
|----------|------|-----------|
| Agent → Memory | 1:1 | FK column |
| Agent → SSO | 1:1 | FK column |
| Agent → Guardrails | M:N | Junction table (with position + sort order) |
| Agent → MCP Servers | M:N | Junction table |
| Agent → Observability | M:N | Junction table |
| Agent → Integrations | M:N | Junction table |
| Agent → Prompts | M:N | Junction table |

Delete policy: **RESTRICT** on resource deletion (prevents deleting resources in use), **CASCADE** on agent deletion (removes associations).

### Database Schema

PostgreSQL 16 with async operations via `asyncpg`. Key tables:

- `users` — UUID PK, email (unique), provider, password hash
- `workspaces` — UUID PK, name, slug (unique)
- `memberships` — User-workspace association with role (owner/admin/member/viewer)
- `managed_agents` — Agent config with materialized `engine_config` JSONB
- `managed_prompts` — Append-only versioned prompts
- Resource tables: `managed_guardrails`, `managed_mcp_servers`, `managed_observabilities`, `managed_memories`, `managed_ssos`, `managed_integrations`
- Junction tables for M:N agent-resource relationships

Migrations are handled by Alembic and auto-run at startup with PostgreSQL advisory locking to prevent concurrent migration.

---

## 5. Agent Schema (Data Contract Layer)

`idun_agent_schema` is the centralized Pydantic model library shared across all components. It defines data contracts between Engine, Manager, and Web UI.

### Core Config Hierarchy

```
EngineConfig
├── server: ServerConfig
│   └── api: ServerAPIConfig (port)
├── agent: AgentConfig
│   ├── type: AgentFramework (LANGGRAPH | ADK | HAYSTACK)
│   └── config: <framework-specific>
├── observability: list[ObservabilityConfig]
├── guardrails: GuardrailsV2
├── mcp_servers: list[MCPServer]
├── prompts: list[PromptConfig]
├── sso: SSOConfig
└── integrations: list[IntegrationConfig]
```

### Framework-Specific Configs

| Framework | Config Model | Key Fields |
|-----------|-------------|------------|
| **LangGraph** | `LangGraphAgentConfig` | `graph_definition`, `checkpointer`, `store` |
| **ADK** | `AdkAgentConfig` | `agent`, `app_name`, `session_service`, `memory_service` |
| **Haystack** | `HaystackAgentConfig` | `component_type`, `component_definition` |

### Design Principles

- **CamelCase aliases** for frontend compatibility (fields accept both snake_case and camelCase)
- **Discriminated unions** for type-safe polymorphism (checkpointers, session services)
- **Environment variable resolution** (`${VAR}` syntax in YAML)
- **Minimal dependencies** — only Pydantic + Jinja2

---

## 6. Web Dashboard (Admin Interface)

A React 19 single-page application providing a visual interface for platform management.

### Tech Stack

- React 19 + TypeScript 5.8 + Vite 7
- styled-components 6 with CSS custom properties (light/dark themes)
- React Router 7 for client-side routing
- i18next for internationalization (7 languages: FR, EN, ES, DE, RU, PT, IT)
- AG-UI Client for agent streaming
- Monaco Editor for code/config editing
- Auto-generated TypeScript types from Manager's OpenAPI spec

### Key Pages

| Page | Purpose |
|------|---------|
| Agent Dashboard | Agent list with search, pagination, status badges |
| Agent Detail | Tabbed view (Overview, Gateway, Config, Prompts, Logs) |
| Agent Form | Multi-step agent creation wizard |
| Resource Pages | Dedicated CRUD for Observability, Memory, MCP, Guardrails, SSO, Integrations |
| Prompt Management | Versioned prompts with Monaco editor and Jinja2 variable detection |
| Settings | Profile, security, appearance, language, notifications |
| Onboarding | First workspace creation for new users |

### State Management

Context-based architecture using React Context API — no external state library. Providers for auth, workspace, theme, loading state, and agent form state.

---

## 7. Configuration System

The Engine is entirely configuration-driven. All behavior is defined declaratively.

### Config Sources (Resolution Priority)

1. `EngineConfig` object passed programmatically (highest)
2. Python dictionary
3. YAML file path
4. Manager API (via `IDUN_AGENT_API_KEY` + `IDUN_MANAGER_HOST`)
5. Default `config.yaml` in working directory (lowest)

### YAML Config Example

```yaml
server:
  api:
    port: 8001

agent:
  type: "LANGGRAPH"
  config:
    name: "My Agent"
    graph_definition: "./agent.py:app"
    checkpointer:
      type: "postgres"
      db_url: "postgresql://user:pass@db:5432/checkpoints"

observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "${LANGFUSE_HOST}"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"

guardrails:
  input:
    - config_id: "DETECT_PII"
  output:
    - config_id: "TOXIC_LANGUAGE"

mcp_servers:
  - name: "time"
    transport: "stdio"
    command: "docker"
    args: ["run", "-i", "--rm", "mcp/time"]

sso:
  enabled: true
  issuer: "https://accounts.google.com"
  client_id: "123456.apps.googleusercontent.com"
  allowed_domains: ["company.com"]

integrations:
  - provider: "WHATSAPP"
    enabled: true
    config:
      access_token: "${WHATSAPP_TOKEN}"
      phone_number_id: "123456"
      verify_token: "${WHATSAPP_VERIFY}"

prompts:
  - prompt_id: "system-prompt"
    version: 1
    content: "You are a helpful assistant for {{ domain }}."
    tags: ["latest"]
```

Environment variables are resolved at runtime using `${VAR}` syntax, keeping secrets out of version control.

---

## 8. Agent Framework Adapters

All adapters implement the `BaseAgent` abstract base class, providing a uniform interface.

### LangGraph Adapter (Primary)

- Loads uncompiled `StateGraph` via dynamic import from `graph_definition` (format: `path/to/file.py:variable`)
- Engine compiles the graph with the configured checkpointer and store
- Full AG-UI event streaming via `astream_events(v2)` — maps to RunStarted, StepStarted, TextMessage events, ToolCall events, Thinking events, RunFinished
- Checkpointing: InMemory, SQLite, PostgreSQL

### Google ADK Adapter

- Loads ADK agents via dynamic import
- Session services: InMemory, VertexAI, Database (PostgreSQL)
- Memory services: InMemory, VertexAI
- Langfuse observability via `GoogleADKInstrumentor` (OpenInference)
- AG-UI streaming via `ADKAGUIAgent`

### Haystack Adapter (Experimental)

- Loads Pipeline or Agent components via dynamic import
- Basic invoke only (no streaming support)
- Stateless execution

---

## 9. Streaming and AG-UI Protocol

The platform implements the AG-UI (Agent-UI) protocol for real-time streaming of agent execution events via Server-Sent Events (SSE).

### Event Types

| Event | Description |
|-------|-------------|
| `RunStarted` | Agent execution begins |
| `StepStarted` / `StepFinished` | Graph node execution boundaries |
| `TextMessageStart` / `TextMessageContent` / `TextMessageEnd` | Incremental text generation |
| `ToolCallStart` / `ToolCallArgs` / `ToolCallEnd` | Tool invocation lifecycle |
| `ThinkingStart` / `ThinkingEnd` | Model reasoning phases |
| `RunFinished` | Agent execution completes |

### Canonical Endpoint

`POST /agent/run` accepts `RunAgentInput` and returns an SSE stream. This single endpoint replaces the older `/agent/invoke`, `/agent/stream`, and `/agent/copilotkit/stream` endpoints (all deprecated).

---

## 10. Observability

Multiple providers can be active simultaneously. All are lazy-loaded and configured at the top level of the YAML config.

### Supported Providers

| Provider | Mechanism | Use Case |
|----------|-----------|----------|
| **Langfuse** | LangChain `CallbackHandler` + env vars | LLM cost tracking, performance metrics, prompt management |
| **Phoenix** (Arize) | OpenTelemetry + `LangChainInstrumentor` | ML observability, trace debugging |
| **GCP Trace** | `CloudTraceSpanExporter` + OpenInference instrumentors | Production distributed tracing on Google Cloud |
| **GCP Logging** | `google.cloud.logging.Client.setup_logging()` | Cloud-native structured logging |
| **LangSmith** | LangChain ecosystem callbacks | LangChain-native monitoring |

### Trace Architecture

```
HTTP Request → Agent Execution → LLM Call → Tool Execution
     │              │                │            │
     └──────────────┴────────────────┴────────────┘
                         │
              Observability Handler(s)
                         │
              Provider Dashboard (traces, costs, metrics)
```

Root spans are created per HTTP request, with child spans for agent invocation, LLM calls, and tool executions. Trace context propagates across async operations.

---

## 11. Guardrails

Guardrails validate inputs before agent invocation and outputs after, using [Guardrails AI Hub](https://hub.guardrailsai.com/). Guards are downloaded and run locally at startup.

### Available Guards

| Guard | Purpose |
|-------|---------|
| `BAN_LIST` | Block specific keywords/phrases |
| `DETECT_PII` | Detect email, phone, SSN, credit cards |
| `NSFW_TEXT` | Inappropriate content detection |
| `TOXIC_LANGUAGE` | Toxicity filtering |
| `RESTRICT_TO_TOPIC` | Topic restriction enforcement |
| `COMPETITION_CHECK` | Competitor mention detection |
| `BIAS_CHECK` | Bias detection |
| `CORRECT_LANGUAGE` | Language validation |
| `GIBBERISH_TEXT` | Gibberish/nonsense detection |
| `DETECT_JAILBREAK` | Jailbreak attempt detection |
| `PROMPT_INJECTION` | Prompt injection prevention |
| `RAG_HALLUCINATION` | RAG hallucination detection |
| `CODE_SCANNER` | Code security scanning |
| `MODEL_ARMOR` | Google Model Armor integration |
| `CUSTOM_LLM` | Custom LLM-based validation |

### Execution Model

- **Input guardrails** run sequentially before agent invocation
- **Output guardrails** run sequentially after agent response
- Violation → HTTP 429 with configurable `reject_message`
- Each guard has typed configuration including `api_key`, `guard_url`, `reject_message`, and guard-specific parameters

---

## 12. MCP Tool Management

The Engine integrates with Model Context Protocol (MCP) servers to extend agent capabilities with external tools.

### Architecture

`MCPClientRegistry` wraps `langchain-mcp-adapters`'s `MultiServerMCPClient`.

### Supported Transports

| Transport | Use Case |
|-----------|----------|
| `stdio` | Local subprocess (Docker containers, CLI tools) |
| `sse` | HTTP Server-Sent Events |
| `streamable_http` | HTTP streaming |
| `websocket` | WebSocket connections |

### Tool Discovery Flow

1. MCP servers launch as subprocesses or connect via HTTP/WebSocket at Engine startup
2. Engine queries servers for available tools
3. Tools are registered with the agent framework (`get_langchain_tools()` for LangGraph, `get_adk_toolsets()` for ADK)
4. Agent tool calls are routed to the appropriate MCP server at runtime

---

## 13. Memory and State Persistence

### LangGraph Checkpointing

| Type | Persistence | Concurrency | Use Case |
|------|-------------|-------------|----------|
| **InMemory** | None (lost on restart) | Single-process | Stateless testing |
| **SQLite** | File-based | Single-process | Local development |
| **PostgreSQL** | Database-backed | Multi-process | Production |

Each `session_id` maps to a unique thread with isolated state. Conversations can resume after failures or restarts.

### ADK Session Services

| Type | Description |
|------|-------------|
| **InMemory** | Ephemeral, development/testing |
| **Database** | SQL-based via SQLAlchemy |
| **VertexAI** | Cloud-native on Google Cloud |

### ADK Memory Services

| Type | Description |
|------|-------------|
| **InMemory** | Ephemeral |
| **VertexAI** | Cloud-backed with long-term storage |

---

## 14. Authentication and Multi-Tenancy

### Manager Authentication

Two modes, controlled by `AUTH__DISABLE_USERNAME_PASSWORD`:

1. **Username/Password** (default): bcrypt-hashed passwords, email/password login
2. **Google OIDC SSO**: OAuth 2.0 flow via `authlib`, supports Okta, Auth0, Azure AD, Google Workspace

Session management uses signed HTTP-only cookies (`itsdangerous.URLSafeTimedSerializer`) with configurable TTL (default: 24 hours).

### Engine Authentication (SSO)

When SSO is enabled, the Engine validates JWT tokens on protected routes against the OIDC provider's JWKS endpoint. Supports domain and email allowlists.

### Multi-Tenancy (Workspaces)

- **Workspaces** provide tenant isolation — all resources are scoped to a workspace
- **Memberships** link users to workspaces with roles: Owner, Admin, Member, Viewer
- **Invitations** allow pre-provisioning workspace access before user signup
- Active workspace resolved via `X-Workspace-Id` header or session default
- All managed resources (agents, guardrails, MCP, etc.) have workspace-scoped FK constraints

### API Key Authentication

The Manager generates per-agent API keys for Engine-to-Manager communication:
- Keys are hashed with `scrypt` and stored as `agent_hash`
- Engines authenticate via `Authorization: Bearer {api_key}`
- `GET /agents/config` returns the materialized config for the authenticated agent

---

## 15. Messaging Integrations

### WhatsApp Cloud API

- Webhook verification (GET) and message reception (POST)
- `send_text_message()` client for outbound messages
- Configured via `access_token`, `phone_number_id`, `verify_token`

### Discord

- Interactions Endpoint with Ed25519 signature verification
- Slash command handling
- `edit_interaction_response()` client for async responses
- Configured via `bot_token`, `application_id`, `public_key`

---

## 16. Prompt Management

### Engine-Level Prompts

- `PromptConfig` with versioning, tags, and Jinja2 template support
- `format(**kwargs)` renders variables using `SandboxedEnvironment` with `StrictUndefined`
- `to_langchain()` converts to LangChain `PromptTemplate`
- Loading priority: explicit path → `IDUN_CONFIG_PATH` env → Manager API

### Manager-Level Prompts

- **Append-only versioning**: content is immutable after creation
- Auto-incrementing version numbers per `prompt_id` within a workspace
- Server-managed `latest` tag
- Agent assignment via M:N junction table
- Assigned prompts are injected into the agent's `engine_config.prompts`

---

## 17. Deployment Architecture

### Local Development

```bash
# Clone and start
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Three services: PostgreSQL 16, Manager (FastAPI, port 8000), Web UI (React/Vite, port 3000).

### Production (Docker Compose)

```yaml
services:
  db:       # PostgreSQL 16 with health checks
  manager:  # freezaa9/idun-ai:0.5.0 (port 8000)
  web:      # freezaa9/idun-ai-web:0.5.0 (port 3000)
  agent:    # Engine instance(s) fetching config from Manager
```

### Standalone Engine

```bash
pip install idun-agent-engine
idun agent serve --source file --path config.yaml
```

No Manager or database required (with in-memory checkpointing).

### Self-Hosted Cloud

Deployment guides available for:
- **GCP** — Cloud Run + Cloud SQL (serverless)
- **AWS** — ECS/EKS deployment options
- **Azure** — Container Apps / AKS
- **Kubernetes** — Helm charts for any K8s cluster

### Idun Cloud (Planned)

Fully managed SaaS with auto-scaling, multi-region HA, managed PostgreSQL, and zero infrastructure management.

---

## 18. Scalability and Performance

### Async-First Architecture

- FastAPI + Starlette with full `async/await` throughout
- Non-blocking I/O for all database and HTTP operations via `asyncpg`
- Concurrent request handling without thread-per-request overhead

### Connection Pooling

- SQLAlchemy async connection pools for PostgreSQL
- Persistent MCP server connections (avoid subprocess startup overhead)
- HTTP client connection reuse for observability providers

### Horizontal Scaling

- **Stateless Engine instances** can scale independently behind a load balancer
- **Shared state storage** via PostgreSQL checkpointing
- **Materialized config** pattern eliminates JOIN overhead at read time
- Manager and Engine scale independently based on load

### Resilience

- Observability failures do not block agent execution (graceful degradation)
- Configurable timeouts for LLM calls and tool executions
- Advisory locking prevents concurrent database migrations

---

## 19. Security Model

| Layer | Mechanism |
|-------|-----------|
| **Manager Auth** | Session cookies (signed, HTTP-only) + OIDC SSO |
| **Engine Auth** | JWT/OIDC validation on protected routes |
| **API Keys** | scrypt-hashed per-agent keys for Manager-Engine communication |
| **Passwords** | bcrypt hashing |
| **Secrets** | `${VAR}` env resolution keeps secrets out of config files |
| **CORS** | Configurable origins on Manager; wildcard + Private Network on Engine |
| **Workspace Isolation** | All resources FK-scoped to workspaces with CASCADE delete |
| **Pre-commit** | Gitleaks secret detection in CI |
| **Guardrails** | Input/output validation for PII, injection, toxicity, jailbreak |

---

## 20. Technology Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Language | Python 3.12+ |
| Web Framework | FastAPI + Uvicorn |
| ORM | SQLAlchemy (async) + asyncpg |
| Database | PostgreSQL 16 |
| Migrations | Alembic |
| Auth | authlib (OIDC), itsdangerous (sessions), bcrypt |
| Schema | Pydantic 2.11+ |
| Build | Hatchling, UV workspace |
| Linting | Ruff, Black, mypy |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 19 + TypeScript 5.8 |
| Bundler | Vite 7 |
| Styling | styled-components 6 + CSS custom properties |
| Routing | React Router 7 |
| i18n | i18next (7 languages) |
| Editor | Monaco Editor |
| Streaming | AG-UI Client |
| Testing | Storybook 9, Vitest, Playwright |

### Agent Frameworks

| Framework | Status |
|-----------|--------|
| LangGraph | Primary, full streaming support |
| Google ADK | Mature, session + memory services |
| Haystack | Experimental, basic invoke |

### Integrations

| Category | Technologies |
|----------|-------------|
| Observability | Langfuse, Arize Phoenix, GCP Trace/Logging, LangSmith |
| Guardrails | Guardrails AI Hub (15+ validators) |
| MCP | langchain-mcp-adapters (stdio, SSE, HTTP, WebSocket) |
| Messaging | WhatsApp Cloud API, Discord Interactions |
| Streaming | AG-UI Protocol (CopilotKit) |

---

## 21. Roadmap

### Shipped

- Multi-framework support (LangGraph, ADK, Haystack)
- AG-UI streaming protocol
- Observability (Langfuse, Phoenix, LangSmith, GCP)
- MCP integration
- Agent Manager with multi-tenancy
- Guardrails AI integration
- A2A foundation support

### In Progress

- RBAC with Okta integration
- Manager SSO (Okta, Auth0)
- Standalone CLI improvements
- Agent templates
- Deployment hardening

### Planned

- GCP/Kubernetes Terraform/Helm deployments
- Agent gateway for A2A and external flows
- Shared tools library
- Secrets management library
- Custom LLM guardrails

### Future

- LLM Gateway + LiteLLM
- Manager dashboarding and logs
- FinOps (costs + budgets)
- MCP Hub registry
- Nvidia NeMo guardrails
- Evaluation pipeline
- Additional frameworks (LlamaIndex, AutoGen, CrewAI, OpenAI)
- Additional observability (Datadog)
- Multimodal support

---

*For more information, visit [github.com/Idun-Group/idun-agent-platform](https://github.com/Idun-Group/idun-agent-platform) or contact contact@idun-group.com.*
