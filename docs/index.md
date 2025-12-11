<div align="center">
  <img src="images/logo.png" alt="Idun Agent Platform" width="65"/>
  <h1 style="font-size: 2em; margin: 0.3em 0;">Idun Agent Platform</h1>
  <p style="font-size: 1.05em; color: #666; max-width: 650px; margin: 0.4em auto 1em auto; line-height: 1.5;">
    <b>From AI prototypes to governed agent fleets on your own infrastructure.</b><br/><br/>
    Idun Agent Platform is an open source control plane for generative AI agents. It turns LangGraph, ADK or Haystack agents into
    <b>production ready services</b> with unified deployment, observability, memory, guardrails and access control.
  </p>
  <p style="font-size: 0.98em; color: #444; max-width: 620px; margin: 0.4em auto 1em auto; line-height: 1.5;">
    <b>Who is this for</b><br/>
    <b>GenAI developers</b> who want to ship agents without rebuilding infra each time.<br/>
    <b>AI and data platform teams</b> who need governance, auditability and sovereignty.
  </p>
  <p style="margin: 0.6em 0 1.2em 0;">
    <a href="https://idun-group.github.io/idun-agent-platform/getting-started/quickstart.md" class="md-button md-button--primary">Quickstart in 5 minutes</a>
    -
    <a href="https://idun-group.github.io/idun-agent-platform/architecture/overview.md" class="md-button">Architecture overview</a>
    -
    <a href="https://idun-group.github.io/idun-agent-platform/roadmap/roadmap.md" class="md-button">Roadmap</a>
    -
    <a href="https://discord.gg/tcwH4z7R" class="md-button">Join the Discord</a>
  </p>
</div>

![Platform workflow](images/platform-workflow.png)

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
    <img src="images/logo/Okta-Logo.png" class="logo-item" alt="Okta"/>
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
    <img src="images/logo/Okta-Logo.png" class="logo-item" alt="Okta"/>
    <img src="images/logo/guardrails-ai.png" class="logo-item" alt="Guardrails AI"/>
    <img src="images/logo/langchain-color.png" class="logo-item" alt="LangChain"/>
    <img src="images/logo/haystack.png" class="logo-item" alt="Haystack"/>
    <img src="images/logo/ag-ui.png" class="logo-item" alt="AG-UI"/>
  </div>
</div>

---

## Should you use Idun Agent Platform

You probably should if:

- You have or plan multiple agents built with LangGraph, ADK, Haystack or similar
- You care about observability, guardrails, security, and AI regulation
- You want to self host or run on your own cloud, not depend on a vendor black box

You probably should not if:

- You are just experimenting with a single toy chatbot
- You do not need observability, governance or multi environment setups yet

---

## For GenAI developers

You want to spend time on agent logic, not boilerplate infra.

With Idun you can:

- Wrap your LangGraph, ADK or Haystack agent as a FastAPI service in minutes
- Get tracing, feedback and metrics without rewriting your code
- Run the same agent locally, on staging and in production with the same config
- Plug tools and memory through configuration instead of hard coding everything

Start building: **[Quickstart guide](getting-started/quickstart.md)**.

---

## For AI and data platform teams

You want to standardize how agents run in production and stay compliant.

With Idun you can:

- Maintain a catalog of approved agents with clear ownership and environments
- Enforce SSO, RBAC and per tenant isolation, integrated with your IdP
- Control which models, tools and data sources each agent can use with MCP
- Enforce guardrails for safety and compliance, with full audit and monitoring

Learn more: **[SSO & RBAC](sso-rbac/overview.md)** · **[Guardrails](guardrails/overview.md)**.

---

## Why Idun exists

Today, each agent framework comes with its own way to deploy, observe and govern agents. The result is a zoo of one off POCs, custom servers and ad hoc dashboards.

Idun Agent Platform gives you:

- **One configuration model**: define agent configurations in one central hub that works across frameworks
- **Production features by default**: memory, observability, guardrails, MCP, SSO access
- **Flexible deployment**: run locally, self host on your own cloud or integrate it into your platform
- **Centralized control**: manage agents, environments and access from one dashboard or CLI

For a deeper architecture overview, see the **[Technical whitepaper](concepts/architecture.md)**.

---

## Key capabilities at a glance

- **Observability**
  Plug Langfuse, Phoenix, LangSmith or GCP, get tracing and metrics for every call.
  → [Observability overview](observability/overview.md)

- **Guardrails**
  Add content safety, PII detection and prompt injection protection in front of any agent.
  → [Guardrails overview](guardrails/overview.md)

- **MCP integration**
  Extend agents with Model Context Protocol servers; Idun manages server lifecycle and tool registration.
  → [MCP configuration](mcp/configuration.md#mcp-servers)

- **Memory and session persistence**
  Persist conversations and state across calls with backends like SQLite or Postgres.
  → [Memory overview](memory/overview.md)

---

## High level architecture

Idun Agent Platform is structured in four layers:

- **Web dashboard**
  UI to create, configure and monitor agents.

- **Manager API**
  Control plane that stores configurations, handles auth, observability and guardrails settings.

- **Engine runtime**
  Executes agents via adapters for LangGraph, ADK, Haystack and others, exposes AG-UI compatible FastAPI endpoints.

- **Data layer**
  PostgreSQL for checkpointing and configuration, MCP servers for external tools and data.

For more, see **[Architecture](concepts/architecture.md)** and **[Deployment options](deployment/overview.md)**.

---

## Quickstart

You need Python 3.12, Docker and Git.

1. Clone the repo

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
```

2. Start the platform locally

```bash
cp .env.example .env

docker compose -f docker-compose.dev.yml up --build
```

3. Open the dashboard at `http://localhost:3000` and create your first agent.

Then follow the **[Quickstart guide](getting-started/quickstart.md)** for a full step-by-step tutorial, including ADK example code.

---

## Project status and roadmap

The platform is under active development and already used in production in real projects.

- ✅ Core runtime on PyPI as `idun-agent-engine`, with adapters for LangGraph and ADK
- ✅ Local and self-hosted deployment with Docker
- ✅ AG-UI compatible CopilotKit endpoint, MCP server support, Guardrails AI, observability (Langfuse, LangSmith, Phoenix, GCP Trace), SSO access to Manager UI
- 🚧 More agent frameworks and MCP integrations, environment management (DEV/STG/PRD), and expanded observability & evaluation
- 🚧 Deployment templates (Terraform, Helm/Kubernetes), ready-to-use agents & MCP tools, and Idun Cloud managed offering

See the detailed **[Roadmap](roadmap/roadmap.md)** for up-to-date status.

---

## Community and support

- Questions and help: **[Discord](https://discord.gg/tcwH4z7R)**
- Proposals and ideas: **[GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions)**
- Bugs and feature requests: **[GitHub Issues](https://github.com/Idun-Group/idun-agent-platform/issues)**

For commercial support, contact **contact@idun-group.com**.
