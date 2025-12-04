# Configuration

## Overview

The Idun Agent Platform uses YAML-based configuration files to define all aspects of your agent's behavior, from the framework and model selection to observability, guardrails, and deployment settings. This approach provides a declarative way to configure agents that can be version-controlled, shared across teams, and easily updated.

Configuration files serve as the single source of truth for your agent setup, whether you're running locally for development or deploying to production through the Manager.

## Configuration Structure

A complete Idun configuration file consists of several top-level sections:

```yaml
# Server Configuration
server:
  api:
    port: 8000

# Agent Definition
agent:
  type: "LANGGRAPH"
  config:
    # Framework-specific configuration

# Observability (Optional)
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      # Provider-specific settings

# Guardrails (Optional)
guardrails:
  enabled: true
  rules:
    # Safety constraints

# MCP Servers (Optional)
mcp_servers:
  - name: "filesystem"
    # MCP server configuration
```

## Core Sections

### Server Configuration

The server section defines how your agent exposes its API:

```yaml
server:
  api:
    port: 8000  # Port for the REST API (default: 8000)
```

### Agent Configuration

The agent section is the heart of your configuration. It specifies which framework to use and framework-specific settings:

```yaml
agent:
  type: "LANGGRAPH"  # Framework type (required)
  config:            # Framework-specific config (required)
    name: "My Agent"
    # Additional framework-specific fields
```

## Supported Agent Frameworks

The Idun Platform supports multiple agent frameworks, each with its own configuration requirements:

### LangGraph Agents

LangGraph agents use the LangGraph framework for building stateful multi-actor agents with cycles and persistence.

```yaml
agent:
  type: "LANGGRAPH"
  config:
    name: "My LangGraph Agent"
    graph_definition: "./agent.py:graph"  # Path to compiled graph
    checkpointer:                         # Optional persistence
      type: "sqlite"
      db_url: "checkpoints.db"
```

**Key features:**
- Built-in checkpointing for conversation persistence
- Support for complex multi-step workflows
- State management and memory

### Haystack Agents

Haystack agents leverage the Haystack framework for building search and question-answering systems.

```yaml
agent:
  type: "HAYSTACK"
  config:
    name: "My Haystack Agent"
    component_type: "pipeline"  # or "agent"
    component_definition: "./pipeline.py:search_pipeline"
    observability:
      enabled: true
```

**Key features:**
- Powerful document search capabilities
- Integration with various document stores
- Pipeline-based architecture

### ADK Agents

ADK (Agent Development Kit) agents use Google's Agent Development Kit for building production-ready agents with memory and session management.

```yaml
agent:
  type: "ADK"
  config:
    name: "My ADK Agent"
    app_name: "my_app"
    agent: "./agent.py:agent"
    session_service:
      type: "in_memory"
    memory_service:
      type: "in_memory"
```

**Key features:**
- Built-in session and memory services
- Production-ready patterns
- Google Cloud integration

### Template Agents

Idun provides pre-built agent templates for common use cases:

#### Translation Agent
```yaml
agent:
  type: "TRANSLATION_AGENT"
  config:
    name: "Translator"
    model_name: "gemini-2.5-flash"
    source_lang: "English"
    target_lang: "Spanish"
    graph_definition: "idun_agent_engine.templates.translation:graph"
```

#### Correction Agent
```yaml
agent:
  type: "CORRECTION_AGENT"
  config:
    name: "Grammar Checker"
    model_name: "gemini-2.5-flash"
    language: "French"
```

#### Deep Research Agent
```yaml
agent:
  type: "DEEP_RESEARCH_AGENT"
  config:
    name: "Research Assistant"
    model_name: "gemini-2.5-flash"
    tavily_api_key: "${TAVILY_API_KEY}"
    prompt: "Research topic"
    project: "my-gcp-project"
    region: "us-central1"
```

## Observability

The observability section enables monitoring, tracing, and logging for your agents. Multiple observability providers can be configured simultaneously.

```yaml
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
      run_name: "production-agent"

  - provider: "PHOENIX"
    enabled: true
    config:
      host: "http://localhost:6006"
```

**Supported Providers:**

- **LANGFUSE**: Comprehensive LLM observability platform
- **PHOENIX**: Arize Phoenix for ML observability
- **GCP_LOGGING**: Google Cloud Logging
- **GCP_TRACE**: Google Cloud Trace
- **LANGSMITH**: LangSmith monitoring

Each provider has specific configuration requirements. See the [Observability Reference](../reference/observability.md) for details.

## Guardrails

Guardrails add safety constraints to your agents, filtering harmful content and enforcing compliance policies. They can be applied to both agent inputs (user requests) and outputs (agent responses).

```yaml
guardrails:
  input:
    - config_id: "ban_list"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/ban_list"
      reject_message: "Content blocked"
      guard_params:
        banned_words: ["badword1", "badword2"]
  output:
    - config_id: "pii_detector"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/detect_pii"
      guard_params:
        pii_entities: ["EMAIL_ADDRESS", "PHONE_NUMBER", "SSN"]
```

**Available Guardrail Validators:**

- `ban_list` - Block specific words/phrases
- `detect_pii` - Detect personally identifiable information

Guardrails are powered by [Guardrails AI](https://guardrailsai.com). See the [Guardrails Guide](../guides/05-guardrails.md) for setup instructions.

## MCP Servers

MCP (Model Context Protocol) servers extend your agent's capabilities by providing tools, resources, and prompts through a standardized interface.

```yaml
mcp_servers:
  - name: "filesystem"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]

  - name: "brave-search"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
    env:
      BRAVE_API_KEY: "${BRAVE_API_KEY}"
```

Common MCP servers include:
- Filesystem access
- Web search (Brave, Google)
- Database connections
- API integrations
- Git repositories

## Environment Variable Substitution

Configuration files support environment variable substitution to keep sensitive information out of version control:

```yaml
observability:
  - provider: "LANGFUSE"
    config:
      public_key: "${LANGFUSE_PUBLIC_KEY}"  # Replaced at runtime
      secret_key: "${LANGFUSE_SECRET_KEY}"

mcp_servers:
  - name: "database"
    env:
      DB_URL: "${DATABASE_URL}"
```

**Syntax:**

- `${VAR_NAME}` - Standard format (recommended)
- `$VAR_NAME` - Simple format (for basic variable names)

The Idun engine replaces these placeholders with actual environment variable values at runtime.

## Configuration Validation

All configuration files are validated against Pydantic schemas before the agent starts. Validation checks:

- Required fields are present
- Field types match expectations
- Values are within acceptable ranges
- Referenced files and modules exist
- Framework-specific requirements are met

Validation errors are reported with clear messages indicating what needs to be fixed.

## Best Practices

### Version Control
Store configuration files in version control to track changes and enable rollbacks. Use environment variable substitution for sensitive values that shouldn't be committed.

### Environment-Specific Configs
Maintain separate configuration files for development, staging, and production:

- `config.dev.yaml` - Local development with SQLite checkpointing
- `config.staging.yaml` - Staging environment with test observability
- `config.prod.yaml` - Production with PostgreSQL and full monitoring

### Testing Configurations
Validate configurations locally before deployment:

```bash
idun agent serve --source=file --path=./config.yaml
```

## Example Configurations

Complete configuration examples are available in the `libs/idun_agent_engine/examples/` directory:

- `01_basic_config_file/` - Full LangGraph setup
- `03_minimal_setup/` - Minimal configuration
- `04_haystack_example/` - Haystack agent
- `07_adk/` - ADK agent with MCP servers

## Next Steps

- [Configuration Reference](../reference/configuration.md) - Detailed field documentation
- [CLI Setup](../guides/03-cli-setup.md) - Using configuration with the CLI
- [Observability Guide](../guides/02-observability-checkpointing.md) - Setting up monitoring
