# CLI Reference

## Overview

Complete command-line interface reference for the Idun CLI tool. The CLI provides commands for running agents locally or in production using configurations from the Manager or local files.

## Installation

The Idun CLI is installed automatically when you set up the Idun Agent Engine:

```bash
uv sync
```

Verify the installation:

```bash
idun --help
```

## Global Options

Options that apply to all CLI commands:

```bash
idun --help     # Display help information
idun --version  # Show CLI version
```

---

## Commands

### `idun agent serve`

Start an agent server that exposes a REST API for interacting with your agent. This is the primary command for running agents.

#### Syntax

```bash
idun agent serve --source=<source> [--path=<path>]
```

#### Options

**`--source` (required)**

**Type:** `string`
**Options:** `manager`, `file`

Configuration source for the agent:

- `manager` - Fetch configuration from the Idun Manager API
- `file` - Load configuration from a local YAML file

**`--path` (optional)**

**Type:** `string`

Path to the configuration file. Required when `--source=file`.

Can be relative or absolute:
- Relative: `--path=./config.yaml`
- Absolute: `--path=/absolute/path/to/config.yaml`

#### Configuration from Manager

Load agent configuration from the Idun Manager API. This is the recommended approach for production deployments.

**Required Environment Variables:**

- `IDUN_MANAGER_HOST` - URL of your Idun Manager instance
- `IDUN_AGENT_API_KEY` - API key for authentication

**Example (Mac/Linux):**

```bash
IDUN_MANAGER_HOST="http://localhost:8000" \
IDUN_AGENT_API_KEY="your-api-key" \
idun agent serve --source=manager
```

**Example (Windows PowerShell):**

```powershell
$env:IDUN_MANAGER_HOST="http://localhost:8000"
$env:IDUN_AGENT_API_KEY="your-api-key"
idun agent serve --source=manager
```

**How it works:**

1. The CLI authenticates with the Manager using your API key
2. Fetches the complete agent configuration from `/api/v1/agents/config`
3. Validates the configuration
4. Starts the agent server on the configured port (default: 8000)

**When to use:**

- Production deployments
- Centralized configuration management
- Team collaboration on shared agents
- When you want to update settings without code changes

#### Configuration from File

Load agent configuration from a local YAML file. Ideal for development, testing, and version-controlled configurations.

**Example:**

```bash
idun agent serve --source=file --path=./config.yaml
```

**With absolute path:**

```bash
idun agent serve --source=file --path=/Users/username/projects/agent/config.yaml
```

**How it works:**

1. The CLI loads and parses the YAML configuration file
2. Validates the configuration against the schema
3. Substitutes environment variables (e.g., `${API_KEY}`)
4. Starts the agent server with the specified settings

**When to use:**

- Local development and testing
- Version-controlled configuration files
- Offline development without Manager access
- Custom or experimental configurations

#### Examples

**Local development:**

```bash
idun agent serve --source=file --path=./config.yaml
```

**Production with Manager:**

```bash
export IDUN_MANAGER_HOST="https://manager.example.com"
export IDUN_AGENT_API_KEY="your-production-api-key"
idun agent serve --source=manager
```

**Testing different configurations:**

```bash
# Development config
idun agent serve --source=file --path=./config.dev.yaml

# Staging config
idun agent serve --source=file --path=./config.staging.yaml

# Production config
idun agent serve --source=file --path=./config.prod.yaml
```

#### Output

When the agent server starts successfully, you'll see output similar to:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

The agent REST API is now available at the configured port.

---

## Environment Variables

The CLI uses environment variables for configuration and authentication.

### CLI Configuration

**`IDUN_MANAGER_HOST`**

URL of the Idun Manager instance.

**Required for:** `--source=manager`
**Example:** `http://localhost:8000`, `https://manager.example.com`

```bash
export IDUN_MANAGER_HOST="http://localhost:8000"
```

**`IDUN_AGENT_API_KEY`**

API key for authenticating with the Manager.

**Required for:** `--source=manager`
**Example:** Get this from the Manager UI after creating an agent

```bash
export IDUN_AGENT_API_KEY="your-api-key-here"
```

### Configuration Substitution

When using `--source=file`, environment variables can be referenced in the configuration file using `${VAR_NAME}` syntax:

```yaml
observability:
  - provider: "LANGFUSE"
    config:
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

See the [Environment Variables Reference](environment.md) for a complete list of supported variables.

---

## Troubleshooting

### Command not found

If the `idun` command is not found, ensure you've activated the virtual environment:

**Mac/Linux:**

```bash
source .venv/bin/activate
```

**Windows (PowerShell):**

```powershell
.venv\Scripts\Activate.ps1
```

### Authentication errors (Manager source)

**Error:** `Failed to authenticate with Manager`

**Solutions:**

1. Verify `IDUN_MANAGER_HOST` is accessible and correct
2. Check that `IDUN_AGENT_API_KEY` is valid and not expired
3. Ensure the Manager is running and reachable from your environment
4. Test the Manager URL in your browser or with curl

```bash
curl $IDUN_MANAGER_HOST/health
```

### Configuration validation errors

**Error:** `Configuration validation failed`

**Solutions:**

1. Check that your config file matches the required schema
2. Verify all required fields are present
3. Look for typos in field names or values
4. Ensure environment variables referenced in config are set

```bash
# Check if environment variables are set
echo $LANGFUSE_PUBLIC_KEY
```

### File not found (File source)

**Error:** `Configuration file not found`

**Solutions:**

1. Verify the path to your configuration file is correct
2. Use absolute paths if relative paths aren't working
3. Check file permissions

```bash
# Check if file exists
ls -la ./config.yaml

# Use absolute path
idun agent serve --source=file --path=$(pwd)/config.yaml
```

### Port already in use

**Error:** `Address already in use`

**Solutions:**

1. Change the port in your configuration:

```yaml
server:
  api:
    port: 8001  # Use a different port
```

2. Stop the process using the port:

**Mac/Linux:**

```bash
lsof -ti:8000 | xargs kill -9
```

**Windows (PowerShell):**

```powershell
Get-NetTCPConnection -LocalPort 8000 | Select-Object -ExpandProperty OwningProcess | Stop-Process
```

### Environment variable not set

**Error:** `Environment variable ${VAR_NAME} not found`

**Solution:** Ensure all referenced environment variables are set before starting the agent:

```bash
# List required variables
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
export DATABASE_URL="postgresql://..."

# Then start the agent
idun agent serve --source=file --path=./config.yaml
```

---

## Exit Codes

The CLI uses standard exit codes:

- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Authentication error
- `4` - Network error

---

## See Also

- [CLI Setup Guide](../guides/cli-setup.md) - Detailed setup instructions
- [Configuration Reference](configuration.md) - Complete configuration field documentation
- [Environment Variables](environment.md) - Environment variable reference
- [REST API Reference](rest-api.md) - Agent server API documentation
