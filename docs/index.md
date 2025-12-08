<div align="center">
  <img src="images/logo.png" alt="Idun Agent Platform" width="65"/>
  <h1 style="font-size: 2em; margin: 0.3em 0;">Idun Agent Platform</h1>
  <p style="font-size: 1.05em; color: #666; max-width: 650px; margin: 0.4em auto 1em auto; line-height: 1.5;">
From AI prototypes to governed agent fleets.<br><br>

Idun Agent Platform is an open source, sovereign platform that makes it easy to put generative AI agents in production and operate them at scale, on your own infrastructure.<br><br>

It is built and battle tested with large enterprises that need strong security, observability, MCP and guardrails management with EU level compliance.
  </p>

  <div style="display: inline-block; max-width: 400px;">

[Quickstart Guide →](getting-started/quickstart.md) &nbsp; &nbsp; [Join our Discord →](https://discord.gg/tcwH4z7R)

  </div>
</div>

<style>
@keyframes scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.logo-slider {
  overflow: hidden;
  padding: 0.6em 0;
  background: linear-gradient(to bottom, #fafafa, #ffffff);
  margin: 1em 0;
  max-width: 100%;
}
.logo-track {
  display: flex;
  width: max-content;
  animation: scroll 20s linear infinite;
  align-items: center;
}
.logo-item {
  height: 45px;
  width: auto;
  max-width: 120px;
  max-height: 45px;
  object-fit: contain;
  margin: 0 1.8em;
  opacity: 0.6;
  transition: all 0.3s;
  filter: grayscale(80%);
}
.logo-item:hover {
  opacity: 1;
  filter: grayscale(0%);
  transform: scale(1.1);
}
</style>

<div class="logo-slider">
  <div class="logo-track">
    <img src="images/logo/langgraph-color.png" class="logo-item" alt="LangGraph"/>
    <img src="images/logo/agent-development-kit.png" class="logo-item" alt="Agent Development Kit"/>
    <img src="images/logo/langfuse-color.png" class="logo-item" alt="Langfuse"/>
    <img src="images/logo/mcp.png" class="logo-item" alt="MCP"/>
    <img src="images/logo/A2A.png" class="logo-item" alt="A2A"/>
    <img src="images/logo/Postgresql_elephant.png" class="logo-item" alt="Postgres"/>
    <img src="images/logo/phoenix.svg" class="logo-item" alt="Phoenix"/>
    <img src="images/logo/langsmith-color.png" class="logo-item" alt="LangSmith"/>
    <img src="images/logo/google-cloud.png" class="logo-item" alt="Google Cloud"/>
    <img src="images/logo/guardrails-ai.png" class="logo-item" alt="Guardrails AI"/>
    <img src="images/logo/langchain-color.png" class="logo-item" alt="LangChain"/>
    <img src="images/logo/haystack.png" class="logo-item" alt="Haystack"/>
    <img src="images/logo/ag-ui.png" class="logo-item" alt="AG-UI"/>
    <img src="images/logo/langgraph-color.png" class="logo-item" alt="LangGraph"/>
    <img src="images/logo/agent-development-kit.png" class="logo-item" alt="Agent Development Kit"/>
    <img src="images/logo/langfuse-color.png" class="logo-item" alt="Langfuse"/>
    <img src="images/logo/mcp.png" class="logo-item" alt="MCP"/>
    <img src="images/logo/A2A.png" class="logo-item" alt="A2A"/>
    <img src="images/logo/Postgresql_elephant.png" class="logo-item" alt="Postgres"/>
    <img src="images/logo/phoenix.svg" class="logo-item" alt="Phoenix"/>
    <img src="images/logo/langsmith-color.png" class="logo-item" alt="LangSmith"/>
    <img src="images/logo/google-cloud.png" class="logo-item" alt="Google Cloud"/>
    <img src="images/logo/guardrails-ai.png" class="logo-item" alt="Guardrails AI"/>
    <img src="images/logo/langchain-color.png" class="logo-item" alt="LangChain"/>
    <img src="images/logo/haystack.png" class="logo-item" alt="Haystack"/>
    <img src="images/logo/ag-ui.png" class="logo-item" alt="AG-UI"/>
  </div>
</div>

---

<style>
.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.2em;
  margin: 1.5em 0 2em 0;
}
.feature-card {
  background: #ffffff;
  border: 1px solid #e9d5ff;
  border-radius: 8px;
  padding: 1.3em;
  transition: all 0.3s ease;
}
.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(147, 51, 234, 0.15);
  border-color: #d8b4fe;
}
.feature-title {
  color: #7c3aed;
  font-size: 1em;
  font-weight: 600;
  margin: 0 0 0.5em 0;
}
.feature-desc {
  color: #666;
  font-size: 0.88em;
  line-height: 1.5;
  margin: 0;
}
</style>

![Homepage](images/screenshots/homepage.png)

<h2 style="color: #7c3aed;">For GenAI developer and IA data platform company team</h2>

<h3 style="color: #7c3aed;">I am a GenAI developer</h3>

You want to focus on agents logic and ship agents, not rebuild infrastructure.

With Idun Agent Platform you can:

<div class="feature-grid">
  <div class="feature-card">
    <div class="feature-title">Production AG-UI FastAPI Service</div>
    <p class="feature-desc">Wrap your agent framework (LangGraph, ADK, Haystack) in a production ready FastAPI service with AG-UI endpoint.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Observability</div>
    <p class="feature-desc">Add tracing, feedback and metrics without rewriting your code.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Multi-Environment Support</div>
    <p class="feature-desc">Run the same agent in local, staging and production environments.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Flexible Tools & Memory</div>
    <p class="feature-desc">Access over tools and set memory instead of hard coding.</p>
  </div>
</div>

**Start here:**
[Full Quickstart Guide →](getting-started/quickstart.md)
---

<h3 style="color: #7c3aed;">I represent a IA data platform company team</h3>

You want control, govern and give your developers everything to focus on agents logic.

With Idun Agent Platform you can:

<div class="feature-grid">
  <div class="feature-card">
    <div class="feature-title">Agent Catalog & Ownership</div>
    <p class="feature-desc">Maintain a catalog of approved agents with clear owners and environments.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Access Control & Security</div>
    <p class="feature-desc">Enforce SSO, RBAC and per-tenant isolation, integrated with your identity provider.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Model & Tool Governance</div>
    <p class="feature-desc">Decide which models, tools and data sources with MCP each agent can use.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Enforce Guardrails</div>
    <p class="feature-desc">Enforce guardrails on agents for compliance and safety.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Self-Hosting Flexibility</div>
    <p class="feature-desc">Host everything on your own infrastructure, in the cloud, or on-premises.</p>
  </div>

  <div class="feature-card">
    <div class="feature-title">Audit & Monitoring</div>
    <p class="feature-desc">Monitor, log, and evaluate agent behavior for audit and regulation readiness.</p>
  </div>
</div>

**Start here:**
[Full Quickstart Guide →](getting-started/quickstart.md)
---

## What is Idun?

Idun Agent Platform solves the fragmentation problem in AI agent development. Each framework (LangGraph, Haystack, ADK) has its own deployment patterns, observability solutions, and operational requirements. Idun provides:

**A unified configuration interface** - Define agents using YAML files that work across all supported frameworks

**Production-ready infrastructure** - Built-in checkpointing, observability, guardrails, and MCP server integration

**Flexible deployment** - Run locally for development, deploy to self-hosted infrastructure, or use managed cloud

**Framework-agnostic tooling** - CLI and web dashboard work consistently across all agent types

## Why Choose Idun?

!!! success "Multi-Framework Support"
    Deploy LangGraph graphs, Haystack pipelines, and ADK agents through a single unified interface. Switch frameworks without changing your deployment pipeline or tooling.

!!! success "Production-Ready Features"
    Checkpointing for conversation persistence, observability with Langfuse/Phoenix/GCP, guardrails for content safety, and MCP servers for tool integration—all configured through YAML.

!!! success "Simple Configuration"
    Define your agent, observability, guardrails, and tools. No complex setup scripts or framework-specific deployment code required.

!!! success "Centralized Management"
    Control multiple agents through a web dashboard or CLI. Create, configure, deploy, and monitor agents from one place.

## Key Features

### Observability

Integrate with multiple observability providers simultaneously. Track LLM calls, measure costs, monitor performance, and debug agent behavior.

Supported providers:

- **Langfuse** - LLM-specific tracing with cost tracking
- **Phoenix** - OpenTelemetry-based ML observability
- **GCP Logging/Trace** - Cloud-native logging and distributed tracing
- **LangSmith** - LangChain ecosystem monitoring

[Observability Guide →](observability/setup-guide.md)

### Guardrails

Add safety constraints to filter harmful content and enforce compliance. Powered by Guardrails AI Hub.

Available validators:

- **Ban List** - Block specific words or phrases
- **PII Detector** - Detect and handle personally identifiable information

Configure input validation (before processing) and output validation (before returning responses).

[Guardrails Guide →](guardrails/setup-guide.md)

### MCP Servers

Extend agent capabilities with Model Context Protocol servers. Idun manages server lifecycle, connection management, and tool registration automatically.

Common integrations:

- Filesystem access
- Web search (Brave, Google)
- Database connections
- API integrations
- Git repositories

[MCP Configuration →](mcp/configuration.md#mcp-servers)

### Checkpointing

Persist conversation state across requests. Resume conversations after failures or restarts. Support multiple concurrent conversations with thread isolation.

Supported backends:

- SQLite (local development)
- PostgreSQL (production)
- In-memory (stateless testing)

[Checkpointing Guide →](observability/setup-guide.md)

## Deployment Options

### Local Development

```bash
idun agent serve --source=manager
```

Run agents locally with hot reload, SQLite checkpointing, and local observability.

### Self-Hosted

Deploy with Docker Compose or Kubernetes to your own infrastructure. Includes PostgreSQL database, Manager API, and web dashboard.

```bash
docker compose -f docker-compose.dev.yml up --build
```

[Self-Hosted Deployment →](deployment/self-hosted.md)

### Idun Cloud

Managed hosting with zero infrastructure management. Automatic scaling, built-in high availability, and integrated observability.

Coming Soon

## Use Cases

### Conversational AI

Build chatbots and virtual assistants with:

- Persistent conversation history through checkpointing
- Multi-turn context management
- Tool calling for external integrations (via MCP servers)
- Content safety through guardrails

### Research & Analysis

Deploy research agents that:

- Search and analyze information from multiple sources
- Process documents with Haystack pipelines
- Synthesize findings into structured reports
- Track research provenance through observability

### Workflow Automation

Create automation agents that:

- Handle complex multi-step workflows
- Integrate with external tools via MCP servers
- Make autonomous decisions based on business logic
- Provide audit trails through observability

## Architecture

The platform consists of three main layers:

**Web Dashboard** - User interface for creating and managing agents

**Manager (Control Plane)** - REST API for agent CRUD operations, configuration management, and authentication. Handles observability and guardrails configuration.

**Engine (Runtime)** - Loads and executes agents through framework-specific adapters (LangGraph, Haystack, ADK). Manages observability, guardrails, MCP servers, and provides REST API access.

**Data Layer** - PostgreSQL for checkpointing and configuration storage. MCP servers for tool integrations.

[Architecture Details →](concepts/architecture.md)

## Getting Help

!!! question "Questions & Support"
    **Documentation** - [Guides](getting-started/quickstart.md), [Concepts](concepts/overview.md), [Reference](reference/configuration.md)

    **Community** - [GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions)

    **Issues** - [Report bugs and request features](https://github.com/Idun-Group/idun-agent-platform/issues)

    **Discord** - [Discuss with us](https://discord.gg/N6ppGPrw)

## Next Steps

Ready to build your first agent?

[Quickstart Guide →](getting-started/quickstart.md){ .md-button .md-button--primary }

Want to understand the platform better?

[Concepts Overview →](concepts/overview.md){ .md-button }

Need detailed reference documentation?

[Configuration Reference →](reference/configuration.md){ .md-button }
