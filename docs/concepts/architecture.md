# Architecture

## System Overview

The Idun Agent Platform architecture consists of three layers working together to provide a complete agent deployment and management solution:

```
┌─────────────────────────────────────────────┐
│           Client Applications               │
│     (Web, Mobile, CLI, API consumers)       │
└────────────────┬────────────────────────────┘
                 │ HTTP/REST
                 ▼
┌─────────────────────────────────────────────┐
│         Idun Agent Manager (Optional)       │
│  ┌─────────────────────────────────────┐   │
│  │  REST API │ Web UI │ CLI │ Auth     │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  PostgreSQL Database                │   │
│  │  (Configs, API Keys, Metadata)      │   │
│  └─────────────────────────────────────┘   │
└────────────────┬────────────────────────────┘
                 │ Config Retrieval via API Key
                 ▼
┌─────────────────────────────────────────────┐
│           Idun Agent Engine                 │
│  ┌─────────────────────────────────────┐   │
│  │  FastAPI Server │ Config Loader     │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  Observability │ Guardrails │ MCP   │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  Framework Adapters                 │   │
│  │  LangGraph │ Haystack │ ADK        │   │
│  └─────────────────────────────────────┘   │
└────────────────┬────────────────────────────┘
                 │ Agent Invocation
                 ▼
┌─────────────────────────────────────────────┐
│      External Services & Storage            │
│  LLMs │ Databases │ Vector Stores │ APIs   │
└─────────────────────────────────────────────┘
```

## Component Details

### Engine (Runtime Layer)

The Engine is the runtime execution environment for AI agents. It's a FastAPI application that loads agent code, manages framework-specific adapters, and provides a unified REST API.

**Application Factory** (`create_app`)

Creates and configures the FastAPI application instance:
- Accepts configuration from three sources: `EngineConfig` object (highest priority), configuration dictionary, or YAML file path
- Configures middleware (CORS, error handlers)
- Registers routes (`/agent/invoke`, `/agent/stream`, `/healthz`, `/readyz`)
- Sets up dependency injection for config and agent instances
- Handles graceful shutdown and cleanup

**Configuration System**

Three-tier resolution priority:
1. `EngineConfig` object passed directly to `create_app()` (highest priority)
2. Configuration dictionary (Python dict)
3. File path to YAML configuration (lowest priority)

Environment variable substitution occurs at runtime, replacing `${VAR_NAME}` with actual values. Pydantic validation ensures all required fields are present and types match before agent initialization.

**Server Runner** (`run_server`)

Uvicorn-based server launcher:
- Hot-reload support for development
- Multi-worker configuration for production
- Graceful shutdown with signal handling
- Configurable host, port, and logging levels

**Agent Adapters**

Framework-specific implementations of the `BaseAgent` protocol:
- **LangGraph Adapter**: Loads compiled graphs, manages checkpointing (SQLite/PostgreSQL/In-Memory), streams execution events
- **Haystack Adapter**: Loads pipelines or agents, integrates with document stores and retrievers
- **ADK Adapter**: Initializes session services (InMemory/Database/VertexAI) and memory services (InMemory/VertexAI)

**Request Processing Pipeline**

1. HTTP request received at `/agent/invoke` or `/agent/stream`
2. Route to appropriate endpoint handler
3. Load agent configuration (if not cached)
4. Execute input guardrails sequentially
5. Invoke agent via framework adapter
6. Execute output guardrails sequentially
7. Return response with observability trace IDs

### Manager (Control Plane)

The Manager provides centralized configuration storage and multi-tenant agent hosting. It's an optional component—agents can run directly with the Engine for simpler deployments.

**REST API Layer**

FastAPI application with endpoints for:
- **Agents**: CRUD operations, API key generation, configuration retrieval
- **Observability**: CRUD for observability provider configurations
- **Guardrails**: CRUD for guardrail validator configurations
- **MCP Servers**: CRUD for MCP server configurations
- **Agent Frameworks**: List available frameworks and metadata
- **Health Checks**: `/healthz` and `/readyz` for monitoring

**Database Persistence**

SQLAlchemy async ORM with PostgreSQL:
- `ManagedAgentModel`: Stores agent configurations and metadata
- `ManagedObservabilityModel`: Stores observability provider configs
- `ManagedGuardrailModel`: Stores guardrail validator configs
- `ManagedMCPServerModel`: Stores MCP server configs
- Includes `created_at`, `updated_at` timestamps for audit trails
- Connection pooling for performance
- Alembic migrations for schema changes

**Authentication System**

API key-based authentication:
- Generates unique keys per agent: `idun-{random_hash}`
- Cryptographically secure random generation
- Stores `agent_hash` in database for validation
- Bearer token authentication on Engine requests
- Agent-specific access control (one key per agent)

**Configuration Management**

- Stores `EngineConfig` as JSON in database
- Version tracking via `updated_at` timestamps
- Validates configuration before storage using Pydantic schemas
- Supports environment variable placeholders in stored configs

### Schema (Data Models)

Shared Pydantic models used by both Engine and Manager for validation and serialization.

**Configuration Models**

- `EngineConfig`: Top-level configuration (server, agent, observability, guardrails, MCP)
- `ServerConfig`: API server settings (host, port, CORS)
- `AgentConfig`: Framework-specific agent configuration
  - `LangGraphAgentConfig`: Graph definition, checkpointer settings
  - `HaystackAgentConfig`: Component type, component definition
  - `AdkAgentConfig`: Session service, memory service, app name
- `ObservabilityConfig`: Provider type and provider-specific settings
- `GuardrailsConfig`: Input/output guardrail configurations
- `MCPServerConfig`: MCP server connection details

**API Models**

- Request/response schemas for all Engine and Manager endpoints
- Error models with status codes and messages
- Pagination models (limit, offset, total)

## Data Flow Diagrams

### Configuration Flow

```
Manager DB → Manager API → Engine GET /agents/config
                                    ↓
                            ConfigLoader resolves config
                                    ↓
                            Agent Initialization
```

When using the Manager, the Engine requests configuration via API key. When running standalone, the Engine loads configuration from a YAML file directly.

### Request Flow

```
Client → Engine POST /agent/invoke → Input Guardrails
                                           ↓
                                    Agent Adapter
                                           ↓
                                    Framework Agent (LangGraph/Haystack/ADK)
                                           ↓
                            Output Guardrails ← Agent Response
                                    ↓
                            Client Response (JSON)
```

Streaming requests follow a similar flow but use Server-Sent Events (SSE) to stream execution events in real-time.

### State Persistence Flow

```
Agent Execution → State Changes → Checkpointer/Session Service
                                         ↓
                                  Database (SQLite/PostgreSQL)
                                         ↓
                            Next Request → State Reload → Resume Execution
```

LangGraph uses checkpointers for state persistence. ADK uses session services. Haystack pipelines are stateless.

### Observability Trace Flow

```
HTTP Request → Agent Execution → LLM Call → Tool Execution
     ↓              ↓                ↓            ↓
     └──────────────┴────────────────┴────────────┘
                         ↓
              Observability Handler (Langfuse/Phoenix/GCP)
                         ↓
              Provider Dashboard (traces, costs, metrics)
```

All execution steps are captured by observability handlers and sent to configured providers for monitoring and debugging.

## Integration Points

### Manager ↔ Engine

**Configuration Retrieval Flow:**

1. Engine starts with API key (via environment variable or command-line argument)
2. Engine sends `GET /agents/config` with `Authorization: Bearer {api_key}` header
3. Manager validates API key against database
4. Manager retrieves agent configuration from database
5. Manager returns `EngineConfig` as JSON
6. Engine deserializes config and initializes agent
7. Engine operates independently (no further Manager communication during requests)

### Engine ↔ Framework Adapters

**Unified Interface via BaseAgent Protocol:**

All adapters implement the same protocol:
- `async def initialize(config, observability)` - Framework-specific setup
- `async def invoke(message)` - Synchronous request processing
- `async def stream(message)` - Asynchronous event streaming
- `def infos()` - Return adapter metadata

**Request Translation:**

- Engine receives unified request format (dict with `query`, `session_id`, etc.)
- Adapter translates to framework-native format (LangGraph state, Haystack input, ADK message)
- Agent processes using framework's native API
- Adapter translates response back to unified format
- Engine returns standardized response

### Engine ↔ Observability

**Handler Attachment:**

1. Observability handlers initialized during agent setup
2. Handlers registered as callbacks with framework (LangChain callbacks, Haystack tracing, etc.)
3. Framework invokes callbacks during execution (LLM calls, tool use, etc.)
4. Handlers send traces to providers (Langfuse, Phoenix, GCP)

**Trace Propagation:**

- Root span created for HTTP request
- Child spans for agent invocation, LLM calls, tool executions
- Trace context propagated across async operations
- Observability providers receive full trace hierarchy

### Engine ↔ Guardrails

**Validation Hooks:**

- **Input Guardrails**: Execute before agent invocation, validate user input
- **Output Guardrails**: Execute after agent response, validate agent output
- Each guardrail validator runs in sequence
- If any validator fails: return HTTP 422 with custom `reject_message`
- Validation results logged for monitoring

### Engine ↔ MCP Servers

**Lifecycle Management:**

1. **Server Startup**: MCP servers launched as subprocesses when Engine initializes
2. **Connection**: Persistent stdio/HTTP/WebSocket connections established
3. **Tool Discovery**: Engine queries servers for available tools and registers them
4. **Request Routing**: Agent tool calls routed to appropriate MCP server
5. **Health Monitoring**: Engine monitors server health, restarts on failure
6. **Shutdown**: MCP servers terminated gracefully when Engine stops

## Request Lifecycle (Detailed)

### Step 1: Authentication

- Client includes `Authorization: Bearer {api_key}` header (if using Manager)
- Manager validates API key and returns agent configuration
- Engine loads and caches configuration
- Standalone mode skips this step (config loaded from file)

### Step 2: Configuration Loading

- Resolve config source (Manager API, local file, or programmatic config)
- Substitute environment variables (`${VAR_NAME}` → actual values)
- Validate against Pydantic schemas (fail fast on errors)
- Initialize components (agent, observability handlers, guardrails, MCP servers)

### Step 3: Input Validation

- Execute input guardrails in sequence (e.g., ban list, PII detector)
- Each validator checks input against configured rules
- If validation fails:
  - Return `HTTP 422 Unprocessable Entity`
  - Include `reject_message` from guardrail config
  - Log validation failure with details

### Step 4: Agent Invocation

- Route request to appropriate adapter (LangGraph/Haystack/ADK)
- Adapter translates request to framework-native format
- Invoke agent (synchronous or streaming)
- Observability handlers capture execution traces
- Framework executes agent logic (LLM calls, tool use, state transitions)

### Step 5: Output Validation

- Execute output guardrails in sequence
- Each validator checks agent response against rules
- If validation fails:
  - Return `HTTP 422 Unprocessable Entity`
  - Include `reject_message` from guardrail config
  - Log validation failure

### Step 6: Response

- Format response (JSON for `/agent/invoke`, SSE for `/agent/stream`)
- Include observability trace IDs for correlation
- Return to client with appropriate HTTP status

## State Management

### Checkpointing (LangGraph)

**SQLite Checkpointer:**
- File-based persistence (`checkpoints.db`)
- Single-process only (no concurrent access)
- Ideal for local development and testing

**PostgreSQL Checkpointer:**
- Multi-process, production-ready
- Concurrent access with connection pooling
- Requires PostgreSQL database

**In-Memory Checkpointer:**
- No persistence (state lost on restart)
- Fastest performance for stateless testing

**Thread Isolation:**
- Each `session_id` maps to unique thread
- State isolated across conversations
- Resume conversations after failures or restarts

### Session Services (ADK)

- **InMemory**: Development/testing, ephemeral state
- **Database**: SQL-based persistence with SQLAlchemy
- **VertexAI**: Cloud-native session management on Google Cloud

### Memory Services (ADK)

- **InMemory**: Ephemeral memory, no persistence
- **VertexAI**: Cloud-backed memory with long-term storage

## Deployment Architectures

### Local Development

```
Developer Machine
├── Agent Code (agent.py)
├── Configuration (config.yaml)
└── idun agent serve --source=file --path=./config.yaml
    └── Engine running on http://localhost:8000
```

Simplest deployment for development. No database required if using in-memory checkpointing or stateless agents.

### Self-Hosted (Future)

```
Infrastructure (VM/Kubernetes/Docker Compose)
├── Manager Service
│   ├── REST API (FastAPI)
│   ├── Web UI (React dashboard)
│   └── PostgreSQL Database
└── Engine Service(s)
    ├── Load Balancer (nginx/HAProxy)
    └── Multiple Engine instances (horizontal scaling)
```

Production deployment with centralized management. Engines fetch configurations from Manager via API keys.

### Idun Cloud (Planned)

```
Managed Platform
├── Global Load Balancer (multi-region)
├── Manager (multi-region, high availability)
├── Engine Auto-scaling (based on traffic)
└── Managed PostgreSQL (automatic backups, replication)
```

Fully managed platform with zero infrastructure management. Automatic scaling, built-in observability, custom domains, and SSL.

## Scalability Considerations

### Async Processing

- FastAPI built on Starlette with async/await support
- Non-blocking I/O for all database and HTTP operations
- Concurrent request handling without thread-per-request overhead
- Efficient resource utilization under load

### Connection Pooling

- **Database**: SQLAlchemy connection pools for PostgreSQL (checkpointing, Manager database)
- **HTTP Clients**: Connection reuse for observability providers and Manager API
- **MCP Servers**: Persistent connections to avoid subprocess startup overhead

### Resource Management

- **Graceful Degradation**: Observability failures don't block agent execution
- **Circuit Breakers**: Prevent cascading failures when external services are down
- **Timeout Handling**: Configurable timeouts for LLM calls and tool executions
- **Memory Limits**: Configurable limits to prevent runaway memory usage

### Horizontal Scaling

- **Stateless Engine Instances**: Multiple Engine instances can run concurrently
- **Load Balancer Distribution**: Distribute requests across Engine instances
- **Shared State Storage**: Checkpointing database shared across instances
- **Independent Scaling**: Manager and Engine can scale independently based on load

## Next Steps

- [Engine Concepts →](engine.md) - Deep dive into the runtime engine
- [Manager Concepts →](manager.md) - Learn about the control plane
- [Basic Configuration Guide →](../guides/01-basic-configuration.md) - Start building agents
