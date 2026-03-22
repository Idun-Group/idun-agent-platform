# Prompt Management

## Overview

Prompt management lets you version, store, and assign prompt templates to your agents. Instead of hardcoding prompts in your agent code, you define them in the Manager and assign specific versions to agents. Prompts support **Jinja2 variables** (`{{ variable }}`) for dynamic content at runtime.

Key concepts:

- **Prompt ID**: A logical name for a prompt family (e.g., `system-prompt`, `rag-query`)
- **Versions**: Each prompt ID can have multiple versions. Content is **immutable** after creation — updating a prompt creates a new version
- **Latest tag**: The `latest` tag always points to the highest version and is managed automatically
- **Agent assignment**: Specific prompt versions are assigned to agents — agents are pinned to a version until explicitly reassigned

## Configuration

### YAML Config

Prompts can be defined directly in your YAML config file:

```yaml
prompts:
  - prompt_id: "system-prompt"
    version: 1
    content: "You are a helpful assistant specializing in {{ domain }}."
    tags: ["latest"]

  - prompt_id: "rag-query"
    version: 1
    content: |
      Answer the question based on the following context.

      Context: {{ context }}

      Question: {{ query }}
    tags: ["latest"]
```

Each prompt entry includes:

| Field | Type | Description |
|-------|------|-------------|
| **prompt_id** | `string` | Logical identifier for the prompt family |
| **version** | `integer` | Version number (auto-incremented when using the Manager) |
| **content** | `string` | Prompt text, supports Jinja2 `{{ variables }}` |
| **tags** | `list[string]` | Metadata tags. `latest` is auto-managed by the Manager |

### Manager API

The Manager provides full CRUD and assignment endpoints at `/api/v1/prompts/`.

#### Create a prompt

```bash
curl -X POST http://localhost:8000/api/v1/prompts/ \
  -H "Content-Type: application/json" \
  -b "sid=<session_cookie>" \
  -d '{
    "prompt_id": "system-prompt",
    "content": "You are a helpful assistant for {{ domain }}.",
    "tags": ["production"]
  }'
```

The first version is automatically `v1`. Subsequent `POST` requests with the same `prompt_id` auto-increment the version and move the `latest` tag.

#### List prompts

```bash
# List all prompts
curl http://localhost:8000/api/v1/prompts/ -b "sid=<session_cookie>"

# Filter by prompt_id
curl "http://localhost:8000/api/v1/prompts/?prompt_id=system-prompt" -b "sid=<session_cookie>"

# Filter by tag
curl "http://localhost:8000/api/v1/prompts/?tag=latest" -b "sid=<session_cookie>"
```

#### Update tags

Content is immutable — only tags can be updated:

```bash
curl -X PATCH http://localhost:8000/api/v1/prompts/{id} \
  -H "Content-Type: application/json" \
  -b "sid=<session_cookie>" \
  -d '{"tags": ["production", "reviewed"]}'
```

!!! info "The `latest` tag"
    The `latest` tag is managed server-side. Even if you remove it in a `PATCH` request, it will be re-added if this is the highest version. You cannot manually assign `latest` to an older version.

#### Assign a prompt to an agent

```bash
# Assign
curl -X POST http://localhost:8000/api/v1/prompts/{prompt_uuid}/assign/{agent_uuid} \
  -b "sid=<session_cookie>"

# Unassign
curl -X DELETE http://localhost:8000/api/v1/prompts/{prompt_uuid}/assign/{agent_uuid} \
  -b "sid=<session_cookie>"

# List prompts assigned to an agent
curl http://localhost:8000/api/v1/prompts/agent/{agent_uuid} \
  -b "sid=<session_cookie>"
```

Assigned prompts are automatically injected into the agent's `engine_config.prompts` list when the engine fetches its config via `GET /agents/config`.

#### Delete a version

```bash
curl -X DELETE http://localhost:8000/api/v1/prompts/{id} \
  -b "sid=<session_cookie>"
```

If the deleted version had the `latest` tag, it is automatically promoted to the next-highest remaining version.

## Using Prompts in Agent Code

### Loading prompts

The engine provides helpers to load prompts from YAML or the Manager API:

```python
from idun_agent_engine.prompts import get_prompt

# Loads from YAML config, IDUN_CONFIG_PATH env, or Manager API
prompt = get_prompt("system-prompt")
```

Resolution priority:

1. Explicit `config_path` argument
2. `IDUN_CONFIG_PATH` environment variable
3. Manager API (requires `IDUN_AGENT_API_KEY` + `IDUN_MANAGER_HOST`)

### Rendering with Jinja2

Use `format()` to render template variables:

```python
prompt = get_prompt("system-prompt")
rendered = prompt.format(domain="healthcare")
# → "You are a helpful assistant specializing in healthcare."
```

!!! warning "Missing variables"
    `format()` uses Jinja2 strict mode. Missing variables raise a `ValueError` with a descriptive message including the prompt ID and version.

### LangChain integration

Convert a prompt to a LangChain `PromptTemplate`:

```python
prompt = get_prompt("rag-query")
lc_prompt = prompt.to_langchain()

# Use with LangChain
result = lc_prompt.format(context="AI is...", query="What is AI?")
```

!!! info "Optional dependency"
    `to_langchain()` requires `langchain-core`. Install it with `pip install langchain-core`. If not installed, an `ImportError` is raised with installation instructions.

## Manager UI

The Prompts page in the web dashboard provides a visual interface for managing prompts.

### Creating a prompt

1. Navigate to **Prompts** in the sidebar
2. Click **New Prompt**
3. Enter a **Prompt ID** (e.g., `system-prompt`)
4. Write the prompt content in the **editor** — supports Markdown formatting
5. Toggle between **Edit** and **Preview** to see the rendered Markdown
6. Detected Jinja2 `{{ variables }}` are displayed as pills below the editor
7. Add optional **tags** and click **Create**

### Viewing versions

Prompts are grouped by `prompt_id`. Click a group to expand it and see all versions.

- The **latest version** is auto-expanded by default
- Each version shows its content, tags, and creation date
- Toggle between **Raw** and **Preview** to switch between plain text and rendered Markdown

### Updating a prompt

Click **Update** on a prompt group to create a new version. The modal pre-fills with the latest content so you can iterate on it. The previous version remains unchanged.

### Assigning to agents

Click the **link icon** on a prompt version to assign it to an agent. Assigned prompts appear in the agent's **Prompts tab** in the agent detail view.

## Best Practices

!!! tip "Effective prompt management"
    - **Use descriptive prompt IDs** like `system-prompt`, `rag-query`, `summarization` — not `prompt-1`
    - **Keep prompts atomic** — one prompt per concern (system instructions, query template, output format)
    - **Version intentionally** — create new versions for meaningful changes, not typo fixes
    - **Tag for organization** — use tags like `production`, `staging`, `experimental` to track lifecycle
    - **Pin agent versions** — assign specific versions to production agents rather than always using latest

## Troubleshooting

!!! question "Prompt not showing up in agent config?"
    1. Verify the prompt is **assigned** to the agent (check the Prompts tab in agent detail)
    2. Confirm both the prompt and agent are in the **same workspace**
    3. Check that the agent's API key is valid (`GET /agents/config` requires Bearer auth)

!!! question "Variables not rendering?"
    1. Ensure variables use double braces: `{{ variable }}`, not `{ variable }`
    2. Check that all required variables are passed to `format()`
    3. The error message includes the prompt ID and version to help identify the issue

!!! question "Version numbers not incrementing?"
    Version auto-increment is scoped to `(workspace_id, prompt_id)`. If you're creating prompts in a different workspace, versioning starts from 1.

## Next Steps

- [Configure guardrails](../guardrails/overview.md) to add safety to your agents
- [Add MCP servers](../mcp/overview.md) to extend agent capabilities
- [Set up observability](../observability/overview.md) to monitor prompt usage
- [Deploy your agent](../deployment/concepts.md) to production
