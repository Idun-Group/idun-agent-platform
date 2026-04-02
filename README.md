<p align="center">
  <strong>English</strong> | <a href="docs/readme/README.fr.md">Français</a> | <a href="docs/readme/README.es.md">Español</a> | <a href="docs/readme/README.zh.md">中文</a> | <a href="docs/readme/README.ar.md">العربية</a>
</p>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo/light.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/logo/dark.svg">
  <img alt="Idun Agent Platform" src="docs/logo/dark.svg" width="200">
</picture>

<br/>

### Everything you need to deploy AI agents to production

<br/>

[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-purple.svg)](https://www.gnu.org/licenses/gpl-3.0.html)
[![CI](https://github.com/Idun-Group/idun-agent-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Idun-Group/idun-agent-platform/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/idun-agent-engine?color=purple)](https://pypi.org/project/idun-agent-engine/)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-purple?logo=discord&logoColor=white)](https://discord.gg/KCZ6nW2jQe)
[![Stars](https://img.shields.io/github/stars/Idun-Group/idun-agent-platform?style=social)](https://github.com/Idun-Group/idun-agent-platform)
[![Commits](https://img.shields.io/github/commit-activity/m/Idun-Group/idun-agent-platform?color=purple)](https://github.com/Idun-Group/idun-agent-platform)

<br/>

[Cloud](https://cloud.idunplatform.com) · [Quickstart](https://docs.idunplatform.com/quickstart) · [Docs](https://docs.idunplatform.com) · [Discord](https://discord.gg/KCZ6nW2jQe) · [Book a demo](https://calendar.app.google/RSzm7EM5VZY8xVnN9)

⭐ If you find this useful, please star the repo. It helps others discover the project.

</div>

<br/>

<p align="center">Idun Agent Platform is an open-source, self-hosted control plane for <b>LangGraph</b> and <b>Google ADK</b> agents. Enroll your agent and get a production-grade service with built-in observability, guardrails, memory persistence, MCP tool governance, prompt management, and SSO with workspace isolation.</p>

> **Why Idun?** Teams building agents face a bad tradeoff: build the platform yourself (slow, expensive) or adopt a SaaS (lock-in, no sovereignty). Idun is the third path: you keep your agent code, your data, and your infrastructure. The platform handles the production layer.

<p align="center">
  <img src="docs/images/readme/demo.gif" alt="Idun Agent Platform demo" width="100%"/>
</p>

---

## Quick start

> **Prerequisites**: Docker and Git.

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git && cd idun-agent-platform
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Open [localhost:3000](http://localhost:3000). Create an account. Deploy your first agent in 3 clicks.

> [!TIP]
> **Don't need the full platform?** Run a standalone agent with no Manager and no database:
> ```bash
> pip install idun-agent-engine && idun init
> ```
> The interactive TUI configures framework, memory, observability, guardrails, and MCP in one pass. See the [CLI docs](https://docs.idunplatform.com/cli/overview).

---

## What's inside

<table>
<tr>
<td width="50%" valign="top">

### Observability

Langfuse · Arize Phoenix · LangSmith · GCP Trace · GCP Logging

Trace every agent run. Connect multiple providers at the same time through config.

<img src="docs/images/readme/observability.png" alt="Observability" width="100%"/>

</td>
<td width="50%" valign="top">

### Guardrails

PII detection · Toxic language · Ban lists · Topic restriction · Bias checks · NSFW · 9 more

Apply policies per agent on input, output, or both. Powered by Guardrails AI.

<img src="docs/images/readme/guardrails.png" alt="Guardrails" width="100%"/>

</td>
</tr>
<tr>
<td width="50%" valign="top">

### MCP tool governance

Register MCP servers and control which tools each agent can access. Supports stdio, SSE, streamable HTTP, and WebSocket.

<img src="docs/images/readme/mcp.png" alt="MCP" width="100%"/>

</td>
<td width="50%" valign="top">

### Memory and persistence

PostgreSQL · SQLite · In-memory · Vertex AI · ADK Database

Conversations persist across restarts. Pick a backend per agent.

<img src="docs/images/readme/memory.png" alt="Memory" width="100%"/>

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Prompt management

Versioned templates with Jinja2 variables. Assign prompts to agents from the UI or API.

<img src="docs/images/readme/prompts.png" alt="Prompts" width="100%"/>

</td>
<td width="50%" valign="top">

### Messaging integrations

WhatsApp · Discord · Slack

Bidirectional: receive messages, invoke agents, send replies. Webhook verification handled.

<img src="docs/images/readme/integrations.png" alt="Integrations" width="100%"/>

</td>
</tr>
</table>

> [!NOTE]
> **SSO and multi-tenancy** — OIDC with Google and Okta, or username/password. Role-based workspaces (owner, admin, member, viewer). Every resource is scoped to a workspace.

> [!NOTE]
> **AG-UI streaming** — Every agent gets a standards-based streaming API, compatible with CopilotKit clients. Built-in chat playground for testing.

<p align="center">
  <img src="docs/images/readme/agent-detail.png" alt="Agent detail" width="100%"/>
</p>

---

## Architecture

| | |
|---|---|
| **Engine** | Wraps LangGraph/ADK agents into a FastAPI service with AG-UI streaming, checkpointing, guardrails, observability, MCP, and SSO. Config from YAML or Manager API. |
| **Manager** | Control plane. Agent CRUD, resource management, multi-tenant workspaces. Serves materialized configs to engines. |
| **Web UI** | React 19 admin dashboard. Agent creation wizard, resource config, built-in chat, user management. |

```mermaid
flowchart LR
  subgraph Actors
    Users["End users / Apps"]
    Admin["Admin / DevOps"]
    CICD["CI/CD"]
  end

  subgraph Platform["Idun Agent Platform"]
    direction TB
    UI["Web UI"]
    MGR["Manager API"]
    subgraph Engines["Engines"]
      ENG1["LangGraph"]
      ENG2["ADK"]
    end
    DB[(PostgreSQL)]
  end

  subgraph Infra["Your stack"]
    OBS["Observability"]
    MEM[(Memory)]
    LLM["LLMs"]
    TOOLS["MCP tools"]
  end

  Admin --> UI --> MGR --> DB
  Engines -- "config" --> MGR
  CICD --> Engines
  Users --> Engines --> Infra
```

---

## Integrations

<p align="center">
  <img src="old-docs/images/logo/langgraph-color.png" alt="LangGraph" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/agent-development-kit.png" alt="ADK" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/langfuse-color.png" alt="Langfuse" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/mcp.png" alt="MCP" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/Postgresql_elephant.png" alt="PostgreSQL" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/phoenix.svg" alt="Phoenix" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/langsmith-color.png" alt="LangSmith" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/google-cloud.png" alt="Google Cloud" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/Okta-Logo.png" alt="Okta" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/guardrails-ai.png" alt="Guardrails AI" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/langchain-color.png" alt="LangChain" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/A2A.png" alt="A2A" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="old-docs/images/logo/ag-ui.png" alt="AG-UI" style="height:36px; margin:6px; vertical-align:middle;" />
</p>

---

## Idun vs alternatives

| | **Idun Platform** | **LangGraph Cloud** | **LangSmith** | **DIY (FastAPI + glue)** |
|---|:---:|:---:|:---:|:---:|
| Self-hosted / on-prem | ✅ | ❌ | ❌ | ✅ |
| Multi-framework (LangGraph + ADK) | ✅ | LangGraph only | ❌ (observability only) | Manual |
| Guardrails (PII, toxicity, topic) | ✅ 15+ built-in | ❌ | ❌ | Build yourself |
| MCP tool governance | ✅ per-agent | ❌ | ❌ | Build yourself |
| Multi-tenant workspaces + RBAC | ✅ | ❌ | ✅ | Build yourself |
| SSO (OIDC, Okta, Google) | ✅ | ❌ | ✅ | Build yourself |
| Observability (Langfuse, Phoenix, LangSmith, GCP) | ✅ multi-provider | ❌ LangSmith only | ✅ LangSmith only | Manual |
| Memory / checkpointing | ✅ Postgres, SQLite, in-memory | ✅ | ❌ | Build yourself |
| Prompt management (versioned, Jinja2) | ✅ | ❌ | ✅ Hub | Build yourself |
| Messaging (WhatsApp, Discord, Slack) | ✅ | ❌ | ❌ | Build yourself |
| AG-UI / CopilotKit streaming | ✅ | ✅ | ❌ | Manual |
| Admin UI | ✅ | ✅ | ✅ | ❌ |
| Vendor lock-in | **None** | High | High | None |
| Open source | ✅ GPLv3 | ❌ | ❌ | — |
| Maintenance burden | Low | Low | Low | **High** |

> [!NOTE]
> Idun is not a replacement for LangSmith (observability) or LangGraph Cloud (hosting). It is the layer between your agent code and production that handles governance, security, and operations, regardless of which observability or hosting you choose.

---

## Configuration

Every agent is configured through a single YAML file. Here is a complete example with all features enabled:

```yaml
server:
  api:
    port: 8001

agent:
  type: "LANGGRAPH"
  config:
    name: "Support Agent"
    graph_definition: "./agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///checkpoints.db"

observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"

guardrails:
  input:
    - config_id: "DETECT_PII"
      on_fail: "reject"
      reject_message: "Request contains personal information."
  output:
    - config_id: "TOXIC_LANGUAGE"
      on_fail: "reject"

mcp_servers:
  - name: "time"
    transport: "stdio"
    command: "docker"
    args: ["run", "-i", "--rm", "mcp/time"]

prompts:
  - prompt_id: "system-prompt"
    version: 1
    content: "You are a support agent for {{ company_name }}."
    tags: ["latest"]

sso:
  enabled: true
  issuer: "https://accounts.google.com"
  client_id: "123456789.apps.googleusercontent.com"
  allowed_domains: ["yourcompany.com"]

integrations:
  - provider: "WHATSAPP"
    enabled: true
    config:
      access_token: "${WHATSAPP_ACCESS_TOKEN}"
      phone_number_id: "${WHATSAPP_PHONE_ID}"
      verify_token: "${WHATSAPP_VERIFY_TOKEN}"
```

> [!TIP]
> Environment variables like `${LANGFUSE_SECRET_KEY}` are resolved at startup. You can use `.env` files or inject them through Docker/Kubernetes.

Serve from a file:

```bash
pip install idun-agent-engine
idun agent serve --source file --path config.yaml
```

Or fetch config from the Manager:

```bash
export IDUN_AGENT_API_KEY=your-agent-api-key
export IDUN_MANAGER_HOST=https://manager.example.com
idun agent serve --source manager
```

> [!IMPORTANT]
> Full config reference: [docs.idunplatform.com/configuration](https://docs.idunplatform.com/configuration)
>
> 9 runnable agent examples: [idun-agent-template](https://github.com/Idun-Group/idun-agent-template)

---

## Community

| | |
|---|---|
| **Questions and help** | [Discord](https://discord.gg/KCZ6nW2jQe) |
| **Feature requests** | [GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions) |
| **Bug reports** | [GitHub Issues](https://github.com/Idun-Group/idun-agent-platform/issues) |
| **Contributing** | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| **Roadmap** | [ROADMAP.md](./ROADMAP.md) |

## Commercial support

Maintained by [Idun Group](https://idunplatform.com). We help with platform architecture, deployment, and IdP/compliance integration. [Book a call](https://calendar.app.google/RSzm7EM5VZY8xVnN9) · contact@idun-group.com

## Telemetry

Minimal, anonymous usage metrics via PostHog. No PII. [View source](libs/idun_agent_engine/src/idun_agent_engine/telemetry/telemetry.py). Opt out: `IDUN_TELEMETRY_ENABLED=false`

## License

[GPLv3](./LICENSE)
