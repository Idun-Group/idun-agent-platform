# Engine

## Overview

The Idun Agent Engine is the runtime execution layer that loads, initializes, and runs your AI agents. It provides a unified interface across multiple agent frameworks through a standardized adapter pattern, handles configuration management, and exposes your agents via a FastAPI-based REST API.

The engine serves as the foundation of the Idun platform, transforming framework-specific agent implementations into production-ready services with built-in observability, guardrails, checkpointing, and MCP server integration.

## Architecture

### Core Components

The engine consists of four main components:

**Application Factory** (`create_app`)

Creates and configures the FastAPI application instance. Accepts configuration from three sources with priority order:

1. `EngineConfig` object (highest priority)
2. Configuration dictionary
3. File path to YAML configuration (lowest priority)

The factory handles dependency injection, middleware setup, route registration, and lifecycle management.

**Configuration Builder** (`ConfigBuilder`)

Fluent API for programmatically building agent configurations. Provides methods for setting up different agent types, observability providers, guardrails, and MCP servers without writing YAML files.

```python
config = (
    ConfigBuilder()
    .with_langgraph_agent(
        name="My Agent",
        graph_definition="./agent.py:graph"
    )
    .with_api_port(8000)
    .build()
)
```

**Server Runner** (`run_server`)

Uvicorn-based server launcher that starts the FastAPI application with configurable host, port, workers, and hot-reload settings. Handles graceful shutdown and signal handling.

**Agent Adapters**

Framework-specific implementations that translate between the engine's unified interface and each agent framework's native API.

### Agent Lifecycle

Every agent goes through a standard lifecycle managed by the engine:

**1. Configuration Loading**

The engine resolves configuration from the provided source (Manager API, local file, or programmatic config). Environment variable substitution occurs at this stage, replacing `${VAR_NAME}` placeholders with actual values.

**2. Agent Initialization**

The appropriate adapter is selected based on the agent type. The adapter loads the agent's code (graph definition, pipeline definition, or agent instance), initializes framework-specific components (checkpointers, session services, memory stores), and attaches observability handlers.

**3. Request Processing**

The agent processes incoming requests through the unified API. Guardrails validate inputs before processing and outputs before returning. Observability traces are captured automatically. MCP servers provide additional capabilities through a standardized registry.

**4. Cleanup**

On shutdown, the engine closes database connections, flushes observability buffers, terminates MCP server processes, and releases resources gracefully.

## Agent Adapters

### BaseAgent Protocol

All adapters implement the `BaseAgent` protocol, which defines the standard interface:

```python
class BaseAgent:
    id: str
    agent_type: str
    agent_instance: Any

    async def initialize(config, observability) -> None
    async def invoke(message) -> Any
    async def stream(message) -> AsyncGenerator
```

This protocol ensures consistent behavior across all supported frameworks.

### LangGraph Adapter

The LangGraph adapter supports stateful multi-actor agents with cycles and persistence.

**Key Features:**

- **Graph Loading**: Dynamically imports the compiled graph from the specified module path
- **Checkpointing**: Supports SQLite, PostgreSQL, and in-memory checkpointers for conversation state persistence
- **Event Streaming**: Streams graph execution events in real-time for responsive UIs
- **CopilotKit Integration**: Compatible with CopilotKit's agent runtime protocol

**Configuration:**

```yaml
agent:
  type: "LANGGRAPH"
  config:
    name: "My Agent"
    graph_definition: "./agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "checkpoints.db"
```

The adapter handles thread management, state persistence, and error recovery automatically.

### Haystack Adapter

The Haystack adapter enables document search and question-answering systems.

**Key Features:**

- **Component Types**: Supports both pipelines and agents
- **Document Processing**: Integrates with various document stores and retrievers
- **Pipeline Architecture**: Executes multi-step processing workflows
- **Native Observability**: Leverages Haystack's built-in tracing capabilities

**Configuration:**

```yaml
agent:
  type: "HAYSTACK"
  config:
    name: "Search Agent"
    component_type: "pipeline"
    component_definition: "./pipeline.py:search_pipeline"
```

### ADK Adapter

The ADK (Agent Development Kit) adapter provides Google Cloud-native agent capabilities.

**Key Features:**

- **Session Management**: Built-in session service with in-memory or Firestore backends
- **Memory Services**: Persistent memory across conversations with multiple storage options
- **Cloud Integration**: First-class support for Google Cloud services (Vertex AI, Firestore, Cloud Logging)
- **Production Patterns**: Enterprise-ready patterns for scaling and reliability

**Configuration:**

```yaml
agent:
  type: "ADK"
  config:
    name: "ADK Agent"
    app_name: "my_app"
    agent: "./agent.py:agent"
    session_service:
      type: "in_memory"
    memory_service:
      type: "in_memory"
```

## Configuration Processing

### Resolution Flow

Configuration is resolved in a three-tier priority system:

1. **EngineConfig Object**: Passed directly to `create_app()` (highest priority)
2. **Configuration Dictionary**: Python dict with configuration structure
3. **File Path**: Path to YAML configuration file (lowest priority)

When multiple sources are provided, higher-priority sources override lower-priority ones.

### Validation

All configurations are validated against Pydantic schemas before agent initialization. Validation ensures:

- Required fields are present
- Field types match schema definitions
- Enum values are valid
- Referenced files and modules exist
- Framework-specific requirements are met

Validation errors are reported immediately with clear messages indicating what needs to be fixed.

### Environment Variables

The engine performs environment variable substitution at runtime. Both formats are supported:

- `${VAR_NAME}` (recommended)
- `$VAR_NAME` (simple)

If a referenced variable is not set, the engine fails fast with a descriptive error message.

## Message Processing

### Invoke Mode

Synchronous request-response processing for single-turn interactions.

**Endpoint:** `POST /agent/invoke`

**Request:**
```json
{
  "query": "What is the weather today?",
  "session_id": "user-123"
}
```

**Response:**
```json
{
  "response": "The current weather is sunny with 72°F..."
}
```

The engine validates input through guardrails, processes the request through the agent, validates output through guardrails, and returns the final response.

### Stream Mode

Asynchronous event streaming for real-time UI updates.

**Endpoint:** `POST /agent/stream`

**Event Format:**
The engine streams events in the `ag-ui` format, compatible with agent UI frameworks:

```json
{"event": "on_agent_start", "data": {...}}
{"event": "on_llm_stream", "data": {"chunk": "Hello"}}
{"event": "on_tool_start", "data": {"tool": "search"}}
{"event": "on_agent_end", "data": {...}}
```

Streaming enables responsive user experiences by showing intermediate steps, tool executions, and partial responses.

## Observability Integration

### Handler Attachment

Observability handlers are automatically attached during agent initialization. The engine supports multiple providers simultaneously:

- **Langfuse**: LLM-specific tracing with cost tracking and performance metrics
- **Phoenix**: OpenTelemetry-based instrumentation for ML observability
- **GCP Logging**: Cloud Logging integration with structured logs
- **GCP Trace**: Cloud Trace integration for distributed tracing
- **LangSmith**: LangChain ecosystem monitoring and debugging

### Trace Propagation

The engine propagates trace context across all components:

1. HTTP request initiates root span
2. Agent invocation creates child span
3. LLM calls, tool executions, and guardrail validations create nested spans
4. Observability providers receive complete trace hierarchy

This provides end-to-end visibility from API request to final response.

## Guardrails System

### Validation Flow

Guardrails are applied at two points in the request lifecycle:

**Input Guardrails** → Validate user input before agent processing
**Output Guardrails** → Validate agent response before returning

If validation fails, the request is rejected with a custom message.

### Supported Validators

The engine integrates with Guardrails AI Hub for validation:

- **Ban List** (`hub://guardrails/ban_list`): Blocks specific words or phrases
- **PII Detector** (`hub://guardrails/detect_pii`): Detects personally identifiable information

Each validator is configured with a `config_id`, `api_key`, `guard_url`, and framework-specific `guard_params`.

### Configuration

```yaml
guardrails:
  input:
    - config_id: "profanity_filter"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/ban_list"
      guard_params:
        banned_words: ["word1", "word2"]
  output:
    - config_id: "pii_protection"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/detect_pii"
      guard_params:
        pii_entities: ["EMAIL_ADDRESS", "PHONE_NUMBER"]
```

## MCP Integration

### Registry Pattern

The engine maintains an MCP server registry that manages server lifecycle:

1. **Server Startup**: Launches MCP server processes when the agent initializes
2. **Connection Management**: Maintains persistent connections with stdio, HTTP, or WebSocket transport
3. **Tool Registration**: Discovers and registers tools provided by MCP servers
4. **Request Routing**: Routes tool calls from agents to appropriate MCP servers
5. **Health Monitoring**: Monitors server health and restarts failed processes
6. **Graceful Shutdown**: Terminates MCP server processes cleanly on agent shutdown

### Server Configuration

```yaml
mcp_servers:
  - name: "filesystem"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    env:
      LOG_LEVEL: "info"
  - name: "brave-search"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
    env:
      BRAVE_API_KEY: "${BRAVE_API_KEY}"
```

MCP servers extend agent capabilities without modifying agent code, enabling modular functionality composition.

## REST API

The engine exposes a FastAPI-based REST API with the following endpoints:

**Core Endpoints:**
- `POST /agent/invoke` - Synchronous agent invocation
- `POST /agent/stream` - Asynchronous event streaming
- `GET /healthz` - Health check
- `GET /readyz` - Readiness check with dependency validation
- `GET /version` - Application version information

**Management Endpoints** (when using Manager):
- `GET /agents/config` - Retrieve agent configuration via API key

All endpoints support CORS with configurable origins for web-based clients.

## Error Handling

The engine provides structured error responses with appropriate HTTP status codes:

- **400 Bad Request**: Invalid input format or missing required fields
- **401 Unauthorized**: Missing or invalid API key
- **422 Unprocessable Entity**: Validation errors from Pydantic schemas or guardrails
- **500 Internal Server Error**: Unexpected failures with detailed error messages

Errors include descriptive messages and, in development mode, full stack traces for debugging.

## Performance

### Async Processing

The engine is built on FastAPI's async capabilities, enabling:

- Concurrent request handling without blocking
- Efficient I/O operations for database, LLM, and MCP server calls
- High throughput with low resource usage

### Checkpointing

For LangGraph agents, checkpointing provides:

- Conversation state persistence across requests
- Resume capability after failures or restarts
- Multiple concurrent conversations with thread isolation

### Resource Management

The engine manages resources efficiently:

- Database connection pooling
- MCP server process reuse
- Observability buffer batching
- Graceful degradation under load

## Next Steps

- [Learn about Agent Frameworks →](agent-frameworks.md)
- [Set Up Observability →](../observability/overview.md)
- [Deploy Your Agent →](../deployment/concepts.md)
