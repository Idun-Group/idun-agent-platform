# Environment Variables

## Overview

Environment variables configure Idun Agent Platform components and enable secure credential management. Variables can be set in your shell environment or referenced in configuration files using the `${VAR_NAME}` syntax.

---

## CLI Variables

Environment variables used by the Idun CLI.

### `IDUN_MANAGER_HOST`

**Required for:** `idun agent serve --source=manager`
**Type:** URL
**Example:** `http://localhost:8000`, `https://manager.example.com`

URL of the Idun Manager instance to fetch agent configurations from.

```bash
export IDUN_MANAGER_HOST="http://localhost:8000"
```

**Windows (PowerShell):**

```powershell
$env:IDUN_MANAGER_HOST="http://localhost:8000"
```

### `IDUN_AGENT_API_KEY`

**Required for:** `idun agent serve --source=manager`
**Type:** String
**Example:** Get from the Manager UI after creating an agent

API key for authenticating with the Idun Manager.

```bash
export IDUN_AGENT_API_KEY="your-api-key-here"
```

**Windows (PowerShell):**

```powershell
$env:IDUN_AGENT_API_KEY="your-api-key-here"
```

---

## Observability Variables

Environment variables for observability and monitoring providers.

### Langfuse

**`LANGFUSE_PUBLIC_KEY`**

**Type:** String (starts with `pk-lf-`)
**Required for:** Langfuse observability integration

Langfuse public API key.

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
```

**`LANGFUSE_SECRET_KEY`**

**Type:** String (starts with `sk-lf-`)
**Required for:** Langfuse observability integration

Langfuse secret API key.

```bash
export LANGFUSE_SECRET_KEY="sk-lf-..."
```

**`LANGFUSE_HOST`**

**Type:** URL
**Optional:** Defaults to `https://cloud.langfuse.com`
**Required for:** Self-hosted Langfuse instances

Langfuse instance URL.

```bash
export LANGFUSE_HOST="https://langfuse.example.com"
```

**Configuration Example:**

```yaml
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "${LANGFUSE_HOST}"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

### LangSmith

**`LANGSMITH_API_KEY`**

**Type:** String
**Required for:** LangSmith observability integration

LangSmith API key.

```bash
export LANGSMITH_API_KEY="your-langsmith-key"
```

**Configuration Example:**

```yaml
observability:
  - provider: "LANGSMITH"
    enabled: true
    config:
      api_key: "${LANGSMITH_API_KEY}"
      project_name: "my-project"
```

### Google Cloud Platform

**`GOOGLE_APPLICATION_CREDENTIALS`**

**Type:** File path
**Required for:** GCP Logging, GCP Trace, and Firestore integrations

Path to Google Cloud service account credentials JSON file.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
```

**`GCP_PROJECT_ID`**

**Type:** String
**Required for:** GCP services

Google Cloud project ID.

```bash
export GCP_PROJECT_ID="my-project-id"
```

**Configuration Example:**

```yaml
observability:
  - provider: "GCP_LOGGING"
    enabled: true
    config:
      project_id: "${GCP_PROJECT_ID}"
```

---

## Guardrails Variables

### `GUARDRAILS_API_KEY`

**Type:** String
**Required for:** Guardrails functionality
**Provider:** [Guardrails AI](https://guardrailsai.com)

API key for Guardrails AI service.

```bash
export GUARDRAILS_API_KEY="your-guardrails-api-key"
```

Without this key, guardrails features will not be available in the Manager UI or agent runtime.

---

## Database Variables

Environment variables for database connections and checkpointing.

### `DATABASE_URL`

**Type:** Connection string
**Required for:** PostgreSQL checkpointing
**Format:** `postgresql://username:password@host:port/database`

PostgreSQL database connection URL.

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/agent_db"
```

**Configuration Example:**

```yaml
agent:
  config:
    checkpointer:
      type: "postgres"
      db_url: "${DATABASE_URL}"
```

### `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**Type:** Strings/Numbers
**Optional:** Alternative to `DATABASE_URL`

Individual database connection parameters that can be composed in configuration.

```bash
export DB_HOST="localhost"
export DB_PORT="5432"
export DB_USER="agent_user"
export DB_PASSWORD="secure_password"
export DB_NAME="agent_db"
```

**Configuration Example:**

```yaml
agent:
  config:
    checkpointer:
      type: "postgres"
      db_url: "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
```

---

## MCP Server Variables

Environment variables for Model Context Protocol server integrations.

### Search APIs

**`BRAVE_API_KEY`**

**Type:** String
**Required for:** Brave Search MCP server

Brave Search API key.

```bash
export BRAVE_API_KEY="your-brave-api-key"
```

**`TAVILY_API_KEY`**

**Type:** String
**Required for:** Tavily Search integration and Deep Research Agent

Tavily API key.

```bash
export TAVILY_API_KEY="your-tavily-api-key"
```

**Configuration Example:**

```yaml
mcp_servers:
  - name: "brave-search"
    transport: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
    env:
      BRAVE_API_KEY: "${BRAVE_API_KEY}"
```

### Other MCP Integrations

**`GITHUB_TOKEN`**

**Type:** String
**Required for:** GitHub MCP server

GitHub personal access token.

```bash
export GITHUB_TOKEN="ghp_..."
```

**`SLACK_BOT_TOKEN`**

**Type:** String
**Required for:** Slack MCP server

Slack bot authentication token.

```bash
export SLACK_BOT_TOKEN="xoxb-..."
```

---

## LLM Provider Variables

API keys for various LLM providers used by agents.

### `OPENAI_API_KEY`

**Type:** String
**Required for:** OpenAI models (GPT-4, GPT-3.5, etc.)

OpenAI API key.

```bash
export OPENAI_API_KEY="sk-..."
```

### `ANTHROPIC_API_KEY`

**Type:** String
**Required for:** Anthropic models (Claude)

Anthropic API key.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### `GOOGLE_API_KEY`

**Type:** String
**Required for:** Google AI models (Gemini)

Google AI API key.

```bash
export GOOGLE_API_KEY="your-google-api-key"
```

### `AZURE_OPENAI_API_KEY`

**Type:** String
**Required for:** Azure OpenAI services

Azure OpenAI API key.

```bash
export AZURE_OPENAI_API_KEY="your-azure-key"
```

**`AZURE_OPENAI_ENDPOINT`**

**Type:** URL
**Required for:** Azure OpenAI services

Azure OpenAI endpoint URL.

```bash
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
```

---

## Variable Substitution in Configuration Files

Environment variables can be referenced in configuration files using substitution syntax.

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

### Examples

**Observability with Langfuse:**

```yaml
observability:
  - provider: "LANGFUSE"
    config:
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

**Database connection:**

```yaml
agent:
  config:
    checkpointer:
      type: "postgres"
      db_url: "${DATABASE_URL}"
```

**MCP server with API key:**

```yaml
mcp_servers:
  - name: "search"
    env:
      API_KEY: "${BRAVE_API_KEY}"
```

### Variable Resolution

Variables are resolved at runtime when the agent starts. If a referenced environment variable is not set:

- The CLI will display an error: `Environment variable ${VAR_NAME} not found`
- The agent will fail to start

Always ensure required environment variables are set before starting the agent.

---

## Setting Environment Variables

### Mac/Linux (Bash/Zsh)

**Single session:**

```bash
export VAR_NAME="value"
```

**Persist across sessions (add to `~/.bashrc` or `~/.zshrc`):**

```bash
echo 'export VAR_NAME="value"' >> ~/.bashrc
source ~/.bashrc
```

### Windows (PowerShell)

**Single session:**

```powershell
$env:VAR_NAME="value"
```

**Persist for user:**

```powershell
[Environment]::SetEnvironmentVariable("VAR_NAME", "value", "User")
```

### Using `.env` Files

Many deployment platforms support `.env` files for environment configuration:

```bash
# .env
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
DATABASE_URL=postgresql://...
GUARDRAILS_API_KEY=...
```

**Note:** Never commit `.env` files with sensitive credentials to version control. Add `.env` to your `.gitignore` file.

---

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** instead of hardcoding secrets in configuration files
3. **Rotate keys regularly** especially for production environments
4. **Use separate keys** for development, staging, and production
5. **Limit key permissions** to only what's necessary
6. **Use secrets managers** (AWS Secrets Manager, HashiCorp Vault, etc.) for production

---

## Verification

Check if environment variables are set:

**Mac/Linux:**

```bash
echo $VAR_NAME
# or
env | grep VAR_NAME
```

**Windows (PowerShell):**

```powershell
echo $env:VAR_NAME
# or
Get-ChildItem Env:VAR_NAME
```

List all environment variables:

**Mac/Linux:**

```bash
env
```

**Windows (PowerShell):**

```powershell
Get-ChildItem Env:
```

---

## See Also

- [Configuration Reference](configuration.md) - Configuration file structure and fields
- [CLI Reference](cli.md) - CLI commands and usage
- [Observability Guide](../observability/setup-guide.md) - Setting up observability
- [Guardrails Guide](../guides/05-guardrails.md) - Configuring guardrails
