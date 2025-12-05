# CLI Setup

## Overview

The Idun CLI provides a command-line interface for running agents with configurations from either the Idun Manager or local files. The primary command, `idun agent serve`, starts an agent server that exposes a REST API for interacting with your agent.

## Installation

The Idun CLI is installed automatically when you set up the Idun Agent Engine:

```bash
uv sync
```

Verify the installation:

```bash
idun --help
```

## The `idun agent serve` Command

The `idun agent serve` command is the core CLI tool for running agents. It supports two configuration sources: loading from the Manager API or from a local configuration file.

### Command Syntax

```bash
idun agent serve --source=<source> [--path=<path>]
```

**Options:**

- `--source` (required): Configuration source
  - `manager` - Fetch configuration from Idun Manager API
  - `file` - Load configuration from a local YAML file

- `--path` (optional): Path to configuration file
  - Required when `--source=file`
  - Example: `--path=./config.yaml` or `--path=/absolute/path/to/config.yaml`

## Configuration Sources

### Option 1: Load from Manager (Recommended for Production)

Loading configuration from the Manager centralizes your agent setup and makes it easy to update configurations without modifying code or redeploying.

**Required Environment Variables:**

- `IDUN_MANAGER_HOST` - URL of your Idun Manager instance
- `IDUN_AGENT_API_KEY` - API key for authentication (get this from the Manager UI)

**Example:**

**Mac/Linux:**
```bash
IDUN_MANAGER_HOST="http://localhost:8000" IDUN_AGENT_API_KEY=<YOUR-API_KEY> idun agent serve --source=manager
```

**Windows (PowerShell):**
```powershell
$env:IDUN_MANAGER_HOST="http://localhost:8000"; $env:IDUN_AGENT_API_KEY="<YOUR-API_KEY>"; idun agent serve --source=manager
```

**How it works:**

1. The CLI authenticates with the Manager using your API key
2. Fetches the complete agent configuration from `/api/v1/agents/config`
3. Validates the configuration
4. Starts the agent server on the configured port

**When to use:**

- Production deployments
- When you want centralized configuration management
- When multiple team members need to run the same agent
- When you want to update agent settings without code changes

### Option 2: Load from File (Development & Testing)

Loading from a file gives you full control over configuration and is ideal for development, testing, and version-controlled agent setups.

**Example:**

```bash
idun agent serve --source=file --path=./config.yaml
```

**How it works:**

1. The CLI loads and parses the YAML configuration file
2. Validates the configuration against the schema
3. Starts the agent server with the specified settings

**When to use:**

- Local development and testing
- Version-controlled configuration files
- Offline development without Manager access
- Custom or experimental configurations

## Configuration File Structure

When using `--source=file`, your `config.yaml` should include:

```yaml
server:
  api:
    port: 8000

agent:
  type: "LANGGRAPH"  # or HAYSTACK, ADK, etc.
  config:
    name: "My Agent"
    graph_definition: "./agent.py:graph"
    # ... framework-specific configuration

# Optional: Observability
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"

# Optional: Guardrails
guardrails:
  enabled: true
  rules:
    # ... guardrail configuration

# Optional: MCP Servers
mcp_servers:
  - name: "filesystem"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
```

See the [Configuration Reference](../reference/configuration.md) for complete field documentation.

## Environment Variable Substitution

Configuration files support environment variable substitution for sensitive values:

```yaml
observability:
  - provider: "LANGFUSE"
    config:
      public_key: "${LANGFUSE_PUBLIC_KEY}"  # Substituted at runtime
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

## Common Workflows

### Development Workflow

1. Create a `config.yaml` in your project directory
2. Configure your agent with local paths and settings
3. Run with file source for rapid iteration

```bash
idun agent serve --source=file --path=./config.yaml
```

### Production Workflow

1. Configure your agent in the Manager UI
2. Generate an API key for the agent
3. Set environment variables on your deployment platform
4. Run with manager source

```bash
IDUN_MANAGER_HOST="https://manager.example.com" \
IDUN_AGENT_API_KEY="your-api-key" \
idun agent serve --source=manager
```

### CI/CD Integration

Store configuration in version control and use file source in automated pipelines:

```yaml
# .github/workflows/deploy.yml
- name: Deploy Agent
  run: |
    idun agent serve --source=file --path=./deployment/config.yaml
  env:
    LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
    LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
```

## Troubleshooting

### Command not found

If `idun` command is not found, ensure you've activated the virtual environment:

**Mac/Linux:**
```bash
source .venv/bin/activate
```

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

### Authentication errors (Manager source)

- Verify `IDUN_MANAGER_HOST` is accessible and correct
- Check that `IDUN_AGENT_API_KEY` is valid and not expired
- Ensure the Manager is running and reachable from your environment

### Configuration validation errors

- Check that your config file matches the required schema
- Verify all required fields are present
- Look for typos in field names or values
- Ensure environment variables referenced in config are set

### Port already in use

If the configured port is already in use:

- Change the port in your configuration
- Stop the process using the port
- Use a different agent configuration

## Next Steps

- [Configuration Reference](../reference/configuration.md) - Complete configuration field documentation
- [Observability Setup](02-observability-checkpointing.md) - Add monitoring and tracing
- [Guardrails](05-guardrails.md) - Configure safety constraints
