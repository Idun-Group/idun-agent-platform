# Idun Agent Platform — Features Review

**Version 0.5.0 | March 2026**

---

## What is Idun Agent Platform?

Idun Agent Platform is an open-source control plane that turns AI agent prototypes into production-ready, governed services. It provides a unified layer for deploying, monitoring, securing, and managing AI agents built with LangGraph, Google ADK, or Haystack — all on your own infrastructure.

Think of it as **Kubernetes for AI agents**: you bring the agent code, Idun handles everything else — serving, streaming, observability, guardrails, memory, access control, and multi-tenant management.

---

## Table of Contents

1. [Who Is This For?](#1-who-is-this-for)
2. [How Users Interact with the Platform](#2-how-users-interact-with-the-platform)
3. [Core Platform Capabilities](#3-core-platform-capabilities)
4. [Enterprise Use Cases](#4-enterprise-use-cases)
5. [Feature Deep Dive](#5-feature-deep-dive)
6. [Deployment Options](#6-deployment-options)
7. [Integration Ecosystem](#7-integration-ecosystem)
8. [What Makes Idun Different](#8-what-makes-idun-different)

---

## 1. Who Is This For?

### GenAI Developers

You build AI agents and want to ship them without rebuilding infrastructure each time.

**What you get:**
- Wrap your LangGraph, ADK, or Haystack agent as a production FastAPI service in minutes
- Get tracing, metrics, and cost tracking without rewriting your code
- Run the same agent locally, on staging, and in production with the same config
- Plug tools and memory through YAML configuration instead of hardcoding
- Stream agent responses with a standardized AG-UI protocol that works with any frontend

### AI and Data Platform Teams

You need to standardize how agents run in production and stay compliant.

**What you get:**
- A catalog of approved agents with clear ownership, environments, and versioning
- SSO and RBAC integrated with your identity provider (Okta, Auth0, Google, Azure AD)
- Control over which models, tools, and data sources each agent can access
- Guardrails for safety and compliance with full audit trails
- Multi-tenant workspace isolation for different teams and projects

### CTOs and Engineering Leaders

You want to scale AI agent development across teams without chaos.

**What you get:**
- A single platform to govern all agent deployments across the organization
- Framework-agnostic — teams can use LangGraph, ADK, or Haystack without infrastructure silos
- Self-hosted — full data sovereignty, no vendor lock-in
- Centralized observability and cost visibility across all agents
- Compliance-ready guardrails and audit capabilities

---

## 2. How Users Interact with the Platform

### Path 1: Developer-First (Engine Only)

The fastest path for individual developers. No database or management layer required.

```
1. pip install idun-agent-engine
2. Write your agent (LangGraph, ADK, or Haystack)
3. Create a config.yaml with your settings
4. Run: idun agent serve --source file --path config.yaml
5. Your agent is live at http://localhost:8000
```

**What you can do:**
- Serve any supported agent framework as a REST API
- Stream responses via AG-UI protocol (SSE)
- Add observability (Langfuse, Phoenix, LangSmith, GCP)
- Enable guardrails (PII detection, toxicity filtering, topic restriction)
- Connect MCP tools (filesystem, web search, databases, custom)
- Enable SSO/JWT authentication on agent endpoints
- Connect messaging channels (WhatsApp, Discord)
- Manage prompts with Jinja2 templating and versioning

### Path 2: Team/Enterprise (Full Platform)

For managing multiple agents across teams with centralized governance.

```
1. docker compose up (PostgreSQL + Manager + Web UI)
2. Open the Web Dashboard at http://localhost:3000
3. Create a workspace for your team
4. Create and configure agents through the UI or API
5. Generate API keys for each agent
6. Deploy Engine instances that fetch config from the Manager
```

**What you can do (in addition to Path 1):**
- Manage agents via a visual admin dashboard
- Organize resources into isolated workspaces
- Invite team members with role-based permissions
- Create shared resource libraries (guardrails, MCP servers, observability configs)
- Assign resources to agents with click-to-select
- Track which agents use which resources ("Used by N agents" badges)
- Version and manage prompts centrally
- Generate and rotate API keys per agent
- Hot-reload agent configs without restarting engines

### Path 3: Interactive CLI (TUI)

A terminal-based wizard for guided setup.

```
1. idun init — launches an interactive TUI
2. Configure agent type, observability, guardrails, memory, MCP
3. Preview and launch the agent directly from the terminal
```

---

## 3. Core Platform Capabilities

### Multi-Framework Agent Support

| Framework | Maturity | Streaming | Checkpointing | Key Strength |
|-----------|----------|-----------|----------------|-------------|
| **LangGraph** | Primary | Full AG-UI | SQLite, PostgreSQL, InMemory | Stateful multi-actor workflows with cycles and branching |
| **Google ADK** | Mature | AG-UI | InMemory, Database, VertexAI | Cloud-native with built-in session and memory services |
| **Haystack** | Experimental | Not yet | Stateless | Document search and RAG pipelines |

**Key benefit:** Switch frameworks without changing your deployment, monitoring, or management infrastructure.

### Unified Streaming API (AG-UI Protocol)

Every agent exposes the same `POST /agent/run` endpoint that streams execution events in real-time:

- **Text streaming**: Incremental token-by-token responses
- **Tool call visibility**: See which tools the agent invokes and their arguments
- **Thinking transparency**: Watch the agent's reasoning process
- **Step tracking**: Monitor graph node execution boundaries
- **Human-in-the-loop**: Built-in support for agent-to-human handoff

Connect any frontend — React, mobile, or custom — using the standardized AG-UI client.

### Configuration-Driven Everything

All platform behavior is declarative, defined in YAML:

```yaml
agent:
  type: "LANGGRAPH"
  config:
    name: "Customer Support Bot"
    graph_definition: "./agent.py:app"
    checkpointer:
      type: "postgres"
      db_url: "${CHECKPOINT_DB_URL}"

observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "${LANGFUSE_HOST}"

guardrails:
  input:
    - config_id: "DETECT_PII"
    - config_id: "DETECT_JAILBREAK"
  output:
    - config_id: "TOXIC_LANGUAGE"

mcp_servers:
  - name: "company-docs"
    transport: "stdio"
    command: "docker"
    args: ["run", "-i", "--rm", "company/docs-server"]
```

Environment variables (`${VAR}`) keep secrets out of version control. The same config works in dev, staging, and production.

---

## 4. Enterprise Use Cases

### Use Case 1: Customer Support Automation

**Scenario:** A company deploys multiple AI agents to handle customer inquiries across channels.

**How Idun helps:**
- Deploy a LangGraph agent with conversation memory (PostgreSQL checkpointing)
- Enable PII detection guardrails to protect customer data
- Connect WhatsApp and Discord integrations for multi-channel support
- Monitor agent performance and costs with Langfuse observability
- Manage prompt templates centrally — update responses without redeploying
- SSO integration ensures only authorized support staff can manage agent configs

### Use Case 2: Internal Knowledge Assistant

**Scenario:** An engineering team builds a RAG-based assistant that answers questions from internal documentation.

**How Idun helps:**
- Wrap a Haystack RAG pipeline or LangGraph agent as a production API
- Connect MCP servers for filesystem access, database queries, and web search
- Add topic restriction guardrails to keep the agent focused on relevant topics
- Enable Phoenix observability for debugging retrieval quality
- Deploy with workspace isolation — each department gets its own agents and configs

### Use Case 3: Multi-Agent Orchestration

**Scenario:** A platform team manages a fleet of specialized agents across the organization.

**How Idun helps:**
- Central Manager dashboard shows all agents across workspaces
- Shared resource libraries — create guardrail configs once, apply to many agents
- A2A (Agent-to-Agent) foundation enables agents to delegate tasks
- Per-agent API keys with scoped access control
- Materialized config pattern ensures instant agent startup (zero-JOIN reads)
- Role-based access: Owners manage infrastructure, Members deploy agents, Viewers monitor

### Use Case 4: Regulated Industry Compliance

**Scenario:** A financial services firm needs AI agents that comply with data protection and content safety regulations.

**How Idun helps:**
- Input guardrails: PII detection, jailbreak prevention, prompt injection protection
- Output guardrails: toxicity filtering, bias detection, hallucination detection
- Full observability traces for audit trails
- Self-hosted deployment — data never leaves your infrastructure
- SSO/OIDC integration with enterprise identity providers
- Workspace-scoped resources with delete protection (RESTRICT policy)

### Use Case 5: Rapid Prototyping to Production

**Scenario:** A developer prototypes an agent locally and needs to ship it to production.

**How Idun helps:**
- Start locally with `idun agent serve` — no database, no infrastructure
- Same YAML config works unchanged in production
- Swap `checkpointer.type: "memory"` to `"postgres"` for production persistence
- Add observability and guardrails by adding config sections — zero code changes
- Deploy to GCP Cloud Run, AWS ECS, Kubernetes, or Docker Compose

### Use Case 6: AI Agent Marketplace / SaaS

**Scenario:** A company offers AI agents as a service to multiple clients.

**How Idun helps:**
- Multi-tenant workspaces isolate client data and configurations
- Per-workspace agent catalogs with versioning and status management (Draft → Active → Deprecated)
- API key authentication for programmatic access
- Centralized prompt management with append-only versioning
- Resource sharing across agents with usage tracking

---

## 5. Feature Deep Dive

### Observability

Monitor every aspect of your agent's behavior across 5 providers:

| Provider | What You Get |
|----------|-------------|
| **Langfuse** | LLM cost tracking, latency metrics, prompt management, user feedback, A/B testing |
| **Arize Phoenix** | OpenTelemetry traces, ML-specific debugging, retrieval analysis, embedding visualization |
| **GCP Trace** | Distributed tracing in Google Cloud Console, sampling, cross-service correlation |
| **GCP Logging** | Structured logging in Google Cloud, log-based metrics, alerting |
| **LangSmith** | LangChain-native tracing, dataset management, evaluation runs |

**Key features:**
- Multiple providers active simultaneously (e.g., Langfuse for costs + Phoenix for debugging)
- Full trace hierarchy: HTTP request → agent execution → LLM calls → tool executions
- Observability failures never block agent execution (graceful degradation)
- Zero code changes — add a YAML block and traces flow automatically

### Guardrails

Protect your agents with 15+ built-in validators powered by Guardrails AI Hub:

| Category | Guards |
|----------|--------|
| **Content Safety** | Toxic Language, NSFW Text, Bias Check |
| **Data Protection** | PII Detection (email, phone, SSN, credit cards), Ban List |
| **Security** | Jailbreak Detection, Prompt Injection, Code Scanner |
| **Quality** | Gibberish Detection, Language Validation, Topic Restriction |
| **AI Safety** | RAG Hallucination Detection, Competitor Check, Model Armor |
| **Custom** | Custom LLM-based validation for any rule |

**How it works:**
- **Input guardrails** validate user messages before they reach the agent
- **Output guardrails** validate agent responses before they reach the user
- Guards run sequentially with configurable rejection messages
- Guards are downloaded and executed locally — no external API calls during validation
- Managed through the dashboard with drag-and-drop ordering

### MCP Tool Management

Give your agents access to any tool via the Model Context Protocol:

**Supported transports:**
- `stdio` — Run tools as local Docker containers or CLI processes
- `sse` — Connect to HTTP SSE-based MCP servers
- `streamable_http` — HTTP streaming connections
- `websocket` — WebSocket-based servers

**Example tools you can connect:**
- Filesystem access (read/write files)
- Web search (Brave, Google)
- Database connections (SQL queries)
- Git repositories
- Custom internal APIs
- Any MCP-compatible server

**Management:**
- Configure MCP servers in YAML or through the dashboard
- Create shared MCP server configs and assign to multiple agents
- Track which agents use which MCP servers
- Tools are automatically discovered and registered with the agent framework

### Memory and State Persistence

Persist conversations and agent state across requests:

**LangGraph checkpointing:**
- **InMemory**: Fast but ephemeral — for testing
- **SQLite**: File-based — for local development
- **PostgreSQL**: Production-ready with connection pooling and multi-process support

**ADK services:**
- **Session services**: InMemory, Database (PostgreSQL), VertexAI
- **Memory services**: InMemory, VertexAI (long-term cloud storage)

**Key features:**
- Session isolation via `session_id` — each conversation has independent state
- Resume conversations after failures or restarts
- Managed through the dashboard — create memory configs and assign to agents

### Authentication and Access Control

#### For the Platform (Manager)

- **Username/Password**: Default mode with bcrypt-hashed passwords
- **SSO/OIDC**: Google, Okta, Auth0, Azure AD integration
- **Session cookies**: Signed HTTP-only cookies with configurable TTL
- **Workspaces**: Multi-tenant isolation with role-based access
  - **Owner**: Full control over workspace and billing
  - **Admin**: Manage agents, users, and resources
  - **Member**: Create and deploy agents
  - **Viewer**: Read-only monitoring access

#### For Agents (Engine)

- **SSO/JWT**: OIDC-based authentication on agent endpoints
- **Domain allowlists**: Restrict access to specific email domains
- **API keys**: Per-agent keys for programmatic access (scrypt-hashed)

### Prompt Management

Centrally manage and version prompt templates:

- **Append-only versioning**: Content is immutable after creation — full audit trail
- **Auto-incrementing versions**: Each update creates a new version automatically
- **Jinja2 templates**: Use `{{ variable }}` syntax with sandboxed rendering
- **Tags**: Organize prompts with tags; `latest` tag auto-managed
- **Agent assignment**: Assign specific prompt versions to specific agents
- **Monaco Editor**: Full-featured code editor in the dashboard for prompt authoring
- **Variable detection**: Dashboard auto-detects `{{ variable }}` placeholders

### Messaging Integrations

Connect your agents to messaging platforms:

#### WhatsApp
- Receive messages via WhatsApp Cloud API webhooks
- Send responses automatically
- Configure with access token, phone number ID, and verify token

#### Discord
- Respond to slash commands via Discord Interactions Endpoint
- Ed25519 signature verification for security
- Configure with bot token, application ID, and public key

### Admin Dashboard

A full-featured React web application for visual platform management:

| Feature | Details |
|---------|---------|
| **Agent Dashboard** | List, search, paginate, filter agents by status |
| **Agent Detail** | Tabbed view: Overview, Gateway, Config (Monaco editor), Prompts, Logs |
| **Agent Creation** | Multi-step wizard: name, framework, config, resources |
| **Resource Management** | Dedicated pages for Observability, Memory, MCP, Guardrails, SSO, Integrations |
| **Resource Libraries** | Create configs once, assign to multiple agents with "Used by N agents" tracking |
| **Prompt Editor** | Monaco editor with syntax highlighting, markdown preview, Jinja2 variable detection |
| **User Management** | Invite users, assign roles, manage workspace membership |
| **Settings** | Profile, security, appearance (light/dark/system), language (7 languages), notifications |
| **Internationalization** | French, English, Spanish, German, Russian, Portuguese, Italian |
| **Theme Support** | Light mode, dark mode, system-auto detection |

### CLI and TUI

Command-line tools for developers:

```bash
# Serve from a config file
idun agent serve --source file --path config.yaml

# Serve from the Manager
idun agent serve --source manager

# Interactive TUI for guided setup
idun init
```

The `idun init` command launches a Textual-based terminal UI with screens for:
- Agent configuration (framework, name, graph definition)
- Observability provider setup
- Guardrails configuration
- Memory/checkpointing setup
- MCP server configuration
- Launch and serve

---

## 6. Deployment Options

| Option | Best For | Requirements |
|--------|----------|-------------|
| **Local CLI** | Development, prototyping | Python 3.12, `pip install idun-agent-engine` |
| **Docker Compose** | Team development, staging | Docker + Docker Compose |
| **GCP (Cloud Run)** | Serverless production on Google Cloud | GCP account, Cloud SQL |
| **AWS (ECS/EKS)** | Production on AWS | AWS account |
| **Azure (Container Apps/AKS)** | Production on Azure | Azure subscription |
| **Kubernetes (Helm)** | Any K8s cluster | Kubernetes cluster |
| **Idun Cloud** (planned) | Zero-ops managed hosting | None |

### Minimal Local Setup

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
# Dashboard at http://localhost:3000
# API at http://localhost:8000
```

---

## 7. Integration Ecosystem

```
                    ┌─────────────────────┐
                    │   Agent Frameworks   │
                    │  LangGraph · ADK     │
                    │  Haystack            │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼───────┐    ┌────────▼────────┐    ┌────────▼────────┐
│ Observability │    │   Guardrails    │    │   MCP Tools     │
│───────────────│    │─────────────────│    │─────────────────│
│ Langfuse      │    │ PII Detection   │    │ Filesystem      │
│ Phoenix       │    │ Toxicity        │    │ Web Search      │
│ LangSmith     │    │ Jailbreak       │    │ Databases       │
│ GCP Trace     │    │ Prompt Inject.  │    │ Git             │
│ GCP Logging   │    │ Topic Restrict. │    │ Custom APIs     │
└───────────────┘    │ 15+ validators  │    └─────────────────┘
                     └─────────────────┘
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼───────┐    ┌────────▼────────┐    ┌────────▼────────┐
│   Messaging   │    │   Auth / SSO    │    │   Databases     │
│───────────────│    │─────────────────│    │─────────────────│
│ WhatsApp      │    │ Okta            │    │ PostgreSQL      │
│ Discord       │    │ Auth0           │    │ SQLite          │
│ (Slack soon)  │    │ Google          │    │ VertexAI        │
└───────────────┘    │ Azure AD        │    └─────────────────┘
                     └─────────────────┘
```

---

## 8. What Makes Idun Different

### vs. Building Custom Infrastructure

| Aspect | Custom Build | Idun Agent Platform |
|--------|-------------|-------------------|
| Time to deploy | Weeks per agent | Minutes per agent |
| Observability | Manual instrumentation | YAML config, zero code |
| Guardrails | Build from scratch | 15+ pre-built validators |
| Multi-framework | Separate infra per framework | One platform, all frameworks |
| Multi-tenancy | Build from scratch | Built-in workspaces + RBAC |
| Maintenance | Your responsibility | Community + commercial support |

### vs. Vendor-Managed Platforms

| Aspect | Vendor Platforms | Idun Agent Platform |
|--------|-----------------|-------------------|
| Data sovereignty | Data on vendor servers | Self-hosted, your infrastructure |
| Vendor lock-in | Tied to vendor framework | Open-source, framework-agnostic |
| Customization | Limited to vendor features | Full source code access |
| Pricing | Per-request / per-seat | Free (open-source) |
| Compliance | Depends on vendor | You control the entire stack |

### Key Differentiators

1. **Framework-Agnostic**: One platform for LangGraph, ADK, and Haystack — no infrastructure silos
2. **Self-Hosted**: Full data sovereignty and compliance control on your own infrastructure
3. **Configuration-Driven**: YAML-first approach — no code changes for observability, guardrails, memory, or tools
4. **Materialized Config**: Zero-JOIN reads for instant agent startup — production-optimized from day one
5. **AG-UI Standard**: Industry-standard streaming protocol for seamless frontend integration
6. **Open Source**: Full transparency, community-driven development, no vendor lock-in

---

## Getting Started

**Quickstart (10-15 minutes):**

1. Clone the repository
2. `cp .env.example .env`
3. `docker compose -f docker-compose.dev.yml up --build`
4. Open `http://localhost:3000`

**Resources:**
- Documentation: [idun-group.github.io/idun-agent-platform](https://idun-group.github.io/idun-agent-platform/)
- GitHub: [github.com/Idun-Group/idun-agent-platform](https://github.com/Idun-Group/idun-agent-platform)
- Discord: [discord.gg/KCZ6nW2jQe](https://discord.gg/KCZ6nW2jQe)
- Commercial Support: contact@idun-group.com

---

*Idun Agent Platform is open-source software maintained by Idun Group. From AI prototypes to governed agent fleets on your own infrastructure.*
