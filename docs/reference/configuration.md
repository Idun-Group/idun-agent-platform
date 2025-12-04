# Configuration Reference

## Overview

This reference provides detailed documentation for all configuration fields available in Idun Agent Platform YAML configuration files. Use this as a complete field-by-field reference when building or modifying agent configurations.

For conceptual information and examples, see the [Configuration Guide](../concepts/configuration.md).

---

## Top-Level Structure

```yaml
server:          # API server configuration
agent:           # Agent framework and settings
observability:   # Monitoring and tracing (optional)
guardrails:      # Safety constraints (optional)
mcp_servers:     # MCP server integrations (optional)
```

---

## Server Configuration

Configure the agent's REST API server.

### `server.api.port`

**Type:** `integer`
**Default:** `8000`
**Required:** No

Port number for the REST API server.

```yaml
server:
  api:
    port: 8000
```

---

## Agent Configuration

Core agent framework and behavior configuration.

### `agent.type`

**Type:** `string`
**Required:** Yes
**Options:** `LANGGRAPH`, `HAYSTACK`, `ADK`, `TRANSLATION_AGENT`, `CORRECTION_AGENT`, `DEEP_RESEARCH_AGENT`

Specifies which agent framework to use.

```yaml
agent:
  type: "LANGGRAPH"
```

### `agent.config`

**Type:** `object`
**Required:** Yes

Framework-specific configuration. Contents vary based on `agent.type`.

---

## LangGraph Agent Configuration

Configuration for LangGraph-based agents.

### `agent.config.name`

**Type:** `string`
**Required:** Yes

Display name for the agent.

```yaml
agent:
  config:
    name: "My LangGraph Agent"
```

### `agent.config.graph_definition`

**Type:** `string`
**Required:** Yes
**Format:** `"path/to/file.py:variable_name"`

Python path to the compiled LangGraph.

```yaml
agent:
  config:
    graph_definition: "./agent.py:graph"
```

### `agent.config.checkpointer`

**Type:** `object`
**Required:** No

Persistence configuration for conversation state.

**Fields:**

- `type` (string, required): `"sqlite"` or `"postgres"`
- `db_url` (string, required): Database connection URL or path

```yaml
agent:
  config:
    checkpointer:
      type: "sqlite"
      db_url: "checkpoints.db"
```

**PostgreSQL Example:**

```yaml
agent:
  config:
    checkpointer:
      type: "postgres"
      db_url: "postgresql://user:pass@localhost:5432/dbname"
```

---

## Haystack Agent Configuration

Configuration for Haystack-based agents.

### `agent.config.component_type`

**Type:** `string`
**Required:** Yes
**Options:** `"pipeline"`, `"agent"`

Type of Haystack component.

```yaml
agent:
  config:
    component_type: "pipeline"
```

### `agent.config.component_definition`

**Type:** `string`
**Required:** Yes
**Format:** `"path/to/file.py:variable_name"`

Python path to the Haystack component.

```yaml
agent:
  config:
    component_definition: "./pipeline.py:search_pipeline"
```

### `agent.config.observability`

**Type:** `object`
**Required:** No

Haystack-specific observability configuration.

```yaml
agent:
  config:
    observability:
      enabled: true
```

---

## ADK Agent Configuration

Configuration for Google Agent Development Kit agents.

### `agent.config.app_name`

**Type:** `string`
**Required:** Yes

Application identifier for the ADK agent.

```yaml
agent:
  config:
    app_name: "my_app"
```

### `agent.config.agent`

**Type:** `string`
**Required:** Yes
**Format:** `"path/to/file.py:variable_name"`

Python path to the ADK agent instance.

```yaml
agent:
  config:
    agent: "./agent.py:agent"
```

### `agent.config.session_service`

**Type:** `object`
**Required:** No

Session management configuration.

**Fields:**

- `type` (string): `"in_memory"` or `"firestore"`

```yaml
agent:
  config:
    session_service:
      type: "in_memory"
```

### `agent.config.memory_service`

**Type:** `object`
**Required:** No

Memory service configuration.

**Fields:**

- `type` (string): `"in_memory"` or `"firestore"`

```yaml
agent:
  config:
    memory_service:
      type: "in_memory"
```

---

## Template Agent Configuration

Pre-built agent templates with simplified configuration.

### Translation Agent

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

**Fields:**

- `model_name` (string, required): LLM model identifier
- `source_lang` (string, required): Source language
- `target_lang` (string, required): Target language

### Correction Agent

```yaml
agent:
  type: "CORRECTION_AGENT"
  config:
    name: "Grammar Checker"
    model_name: "gemini-2.5-flash"
    language: "French"
```

**Fields:**

- `model_name` (string, required): LLM model identifier
- `language` (string, required): Target language for corrections

### Deep Research Agent

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

**Fields:**

- `model_name` (string, required): LLM model identifier
- `tavily_api_key` (string, required): Tavily search API key
- `prompt` (string, required): Research prompt template
- `project` (string, optional): GCP project ID
- `region` (string, optional): GCP region

---

## Observability Configuration

Configure monitoring, tracing, and logging providers. Multiple providers can be enabled simultaneously.

### `observability`

**Type:** `array`
**Required:** No

List of observability provider configurations.

```yaml
observability:
  - provider: "LANGFUSE"
    enabled: true
    config: {...}
  - provider: "PHOENIX"
    enabled: true
    config: {...}
```

### Provider Types

**Supported Values:**

- `LANGFUSE` - Langfuse LLM observability platform
- `PHOENIX` - Arize Phoenix ML observability
- `GCP_LOGGING` - Google Cloud Logging
- `GCP_TRACE` - Google Cloud Trace
- `LANGSMITH` - LangSmith monitoring

### Common Fields

- `provider` (string, required): Provider type identifier
- `enabled` (boolean, required): Enable/disable this provider
- `config` (object, required): Provider-specific configuration

### Langfuse Configuration

```yaml
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
      run_name: "production-agent"
```

**Config Fields:**

- `host` (string, required): Langfuse instance URL
- `public_key` (string, required): Langfuse public API key
- `secret_key` (string, required): Langfuse secret API key
- `run_name` (string, optional): Run identifier for traces

### Phoenix Configuration

```yaml
observability:
  - provider: "PHOENIX"
    enabled: true
    config:
      host: "http://localhost:6006"
```

**Config Fields:**

- `host` (string, required): Phoenix server URL

### GCP Logging Configuration

```yaml
observability:
  - provider: "GCP_LOGGING"
    enabled: true
    config:
      project_id: "my-project"
      log_name: "agent-logs"
```

**Config Fields:**

- `project_id` (string, required): GCP project ID
- `log_name` (string, optional): Custom log name

### GCP Trace Configuration

```yaml
observability:
  - provider: "GCP_TRACE"
    enabled: true
    config:
      project_id: "my-project"
```

**Config Fields:**

- `project_id` (string, required): GCP project ID

### LangSmith Configuration

```yaml
observability:
  - provider: "LANGSMITH"
    enabled: true
    config:
      api_key: "${LANGSMITH_API_KEY}"
      project_name: "my-project"
```

**Config Fields:**

- `api_key` (string, required): LangSmith API key
- `project_name` (string, required): LangSmith project identifier

---

## Guardrails Configuration

Safety constraints and content validation rules powered by [Guardrails AI](https://guardrailsai.com).

Guardrails can be applied to agent inputs and outputs to filter harmful content, enforce policies, and maintain safety standards.

### Configuration Structure

```yaml
guardrails:
  input:    # Applied to incoming requests
    - config_id: "ban_list"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/ban_list"
      reject_message: "Content blocked"
      guard_params:
        banned_words:
          - word1
          - word2
  output:   # Applied to agent responses
    - config_id: "pii_detector"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/detect_pii"
      reject_message: "PII detected"
      guard_params:
        pii_entities:
          - EMAIL_ADDRESS
          - PHONE_NUMBER
```

### `guardrails.input`

**Type:** `array`
**Required:** No

List of guardrails applied to agent inputs (user requests).

### `guardrails.output`

**Type:** `array`
**Required:** No

List of guardrails applied to agent outputs (responses).

### Guardrail Configuration Fields

Each guardrail in the `input` or `output` array has these fields:

**`config_id`** (string, required)

Unique identifier for this guardrail configuration.

**`api_key`** (string, required)

Guardrails AI API key. Use environment variable substitution: `"${GUARDRAILS_API_KEY}"`

**`guard_url`** (string, required)

URL to the Guardrails AI Hub validator. Format: `"hub://guardrails/{validator_name}"`

Available validators:
- `hub://guardrails/ban_list` - Block specific words/phrases
- `hub://guardrails/detect_pii` - Detect personally identifiable information

**`reject_message`** (string, optional)

Custom message returned when content is blocked by this guardrail.

**`guard_params`** (object, required)

Validator-specific configuration parameters.

### Example Configurations

**Ban List:**

```yaml
guardrails:
  input:
    - config_id: "profanity_filter"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/ban_list"
      reject_message: "Inappropriate content detected"
      guard_params:
        banned_words:
          - profanity1
          - profanity2
          - competitor_name
```

**PII Detection:**

```yaml
guardrails:
  output:
    - config_id: "pii_protection"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/detect_pii"
      reject_message: "Response contains sensitive information"
      guard_params:
        pii_entities:
          - EMAIL_ADDRESS
          - PHONE_NUMBER
          - SSN
          - LOCATION
```

**Multiple Guardrails:**

```yaml
guardrails:
  input:
    - config_id: "ban_list"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/ban_list"
      guard_params:
        banned_words: ["badword1", "badword2"]
  output:
    - config_id: "pii_detector"
      api_key: "${GUARDRAILS_API_KEY}"
      guard_url: "hub://guardrails/detect_pii"
      guard_params:
        pii_entities: ["EMAIL_ADDRESS", "PHONE_NUMBER"]
```

---

## MCP Servers Configuration

Model Context Protocol servers extend agent capabilities with tools, resources, and prompts.

### `mcp_servers`

**Type:** `array`
**Required:** No

List of MCP server configurations.

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

### MCP Server Fields

#### `name`

**Type:** `string`
**Required:** Yes

Unique identifier for this MCP server.

#### `transport`

**Type:** `string`
**Required:** Yes
**Options:** `stdio`, `http`, `websocket`

Communication transport mechanism.

#### `command`

**Type:** `string`
**Required:** For `stdio` transport

Executable command to start the MCP server.

#### `args`

**Type:** `array of strings`
**Required:** No

Command-line arguments for the MCP server.

#### `env`

**Type:** `object`
**Required:** No

Environment variables for the MCP server process.

```yaml
mcp_servers:
  - name: "database"
    env:
      DB_URL: "${DATABASE_URL}"
      DB_USER: "${DATABASE_USER}"
```

#### `url`

**Type:** `string`
**Required:** For `http` or `websocket` transport

Server endpoint URL.

---

## Environment Variable Substitution

Configuration files support environment variable substitution for sensitive values.

### Syntax

**Standard format (recommended):**

```yaml
config:
  api_key: "${API_KEY}"
```

**Simple format:**

```yaml
config:
  api_key: "$API_KEY"
```

### Usage Examples

**API Keys:**

```yaml
observability:
  - provider: "LANGFUSE"
    config:
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

**Database Credentials:**

```yaml
agent:
  config:
    checkpointer:
      db_url: "${DATABASE_URL}"
```

**MCP Server Environment:**

```yaml
mcp_servers:
  - name: "search"
    env:
      API_KEY: "${SEARCH_API_KEY}"
```

### Variable Resolution

Variables are resolved at runtime when the agent starts. If a referenced environment variable is not set, the agent will fail to start with a clear error message.

---

## Validation

All configuration files are validated against Pydantic schemas before the agent starts.

**Validation checks:**

- Required fields are present
- Field types match schema definitions
- Enum values are valid
- Numeric values are within acceptable ranges
- Referenced files and modules exist
- Framework-specific requirements are met

**Validation errors** provide clear messages indicating which field failed validation and why.

---

## See Also

- [Configuration Guide](../concepts/configuration.md) - Conceptual overview and examples
- [CLI Reference](cli.md) - Using configurations with the CLI
- [Environment Variables](environment.md) - Environment variable reference
- [Observability Reference](observability.md) - Detailed observability configuration
