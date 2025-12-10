<div align="center">
  <img src="docs/images/banner.png" alt="Idun Agent Platform Banner"/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT) [![Python 3.12](https://img.shields.io/badge/python-3.12-purple.svg)](https://www.python.org/downloads/) [![PyPI](https://img.shields.io/pypi/v/idun-agent-engine?color=purple)](https://pypi.org/project/idun-agent-engine/) [![Documentation](https://img.shields.io/badge/docs-mkdocs-purple.svg)](https://idun-group.github.io/idun-agent-platform/) [![GitHub Stars](https://img.shields.io/github/stars/Idun-Group/idun-agent-platform?style=social&label=Star)](https://github.com/Idun-Group/idun-agent-platform) [![Discord](https://img.shields.io/badge/Discord-Join%20Us-purple?logo=discord&logoColor=white)](https://discord.gg/tcwH4z7R)

</div>

<p align="center">
  <b><a href="https://idun-group.github.io/idun-agent-platform/">Documentation</a></b> |
  <b><a href="https://discord.gg/tcwH4z7R">Discord Server</a></b>
  <br/>
  <b><a href="https://idun-group.github.io/idun-agent-platform/getting-started/quickstart/" class="md-button md-button--primary">Quickstart Guide</a></b>
</p>

<p align="center">
  <b>From AI prototypes to governed agent fleets.</b>
</p>

<div align="center" style="margin: 2em 0;">
  <a href="https://www.youtube.com/watch?v=1QJbSrfz5tU">
    <img src="https://img.youtube.com/vi/1QJbSrfz5tU/maxresdefault.jpg" alt="Idun Agent Platform Demo" style="max-width: 100%; border-radius: 8px; width: 560px;">
  </a>
</div>

![Platform Workflow](docs/images/platform-workflow.png)

<p align="center">
  If you find this project useful, please ⭐️ <b>star the repository</b> and join our <b>Discord community</b>!
</p>
<p align="center">
  Made in 🇫🇷 with ❤️
</p>

---

# Idun Agent Platform

**From AI prototypes to governed agent fleets.**

Idun Agent Platform is an open source, sovereign platform that makes it easy to put generative AI agents in production and operate them at scale, on your own infrastructure.

It is built and battle tested with large enterprises that need strong security, observability, MCP and guardrails management with EU level compliance.

```bash
pip install idun-agent-engine
```

![Homepage](docs/images/screenshots/homepage.png)

<p align="center">
  <img src="docs/images/logo/langgraph-color.png"   alt="LangGraph"             style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/agent-development-kit.png" alt="Agent Development Kit" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/langfuse-color.png"    alt="Langfuse"              style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/mcp.png"               alt="MCP"                   style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/A2A.png"               alt="A2A"                   style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/Postgresql_elephant.png" alt="Postgres"            style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/phoenix.svg"           alt="Phoenix"               style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/langsmith-color.png"   alt="LangSmith"             style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/google-cloud.png"      alt="Google Cloud"          style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/Okta-Logo.png"         alt="Okta"                  style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/guardrails-ai.png"     alt="Guardrails AI"         style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/langchain-color.png"   alt="LangChain"             style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/haystack.png"          alt="Haystack"              style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logo/ag-ui.png"          alt="AG-UI"              style="height:36px; margin:6px; vertical-align:middle;" />
</p>

## For GenAI developer and IA data platform company team

### I am a GenAI developer

You want to focus on agents logic and ship agents, not rebuild infrastructure.

With Idun Agent Platform you can:

- **Production AG-UI FastAPI Service**: Wrap your agent framework (LangGraph, ADK, Haystack) in a production ready FastAPI service with AG-UI endpoint.
- **Observability**: Add tracing, feedback and metrics without rewriting your code.
- **Multi-Environment Support**: Run the same agent in local, staging and production environments.
- **Flexible Tools & Memory**: Access over tools and set memory instead of hard coding.

### I represent a IA data platform company team

You want control, govern and give your developers everything to focus on agents logic.

With Idun Agent Platform you can:

- **Agent Catalog & Ownership**: Maintain a catalog of approved agents with clear owners and environments.
- **Access Control & Security**: Enforce SSO, RBAC and per-tenant isolation, integrated with your identity provider.
- **Model & Tool Governance**: Decide which models, tools and data sources with MCP each agent can use.
- **Enforce Guardrails**: Enforce guardrails on agents for compliance and safety.
- **Self-Hosting Flexibility**: Host everything on your own infrastructure, in the cloud, or on-premises.
- **Audit & Monitoring**: Monitor, log, and evaluate agent behavior for audit and regulation readiness.

## What is Idun?

Idun Agent Platform solves the fragmentation problem in AI agent development. Each framework (LangGraph, Haystack, ADK) has its own deployment patterns, observability solutions, and operational requirements. Idun provides:

- **A unified configuration interface** - Define agents using YAML files that work across all supported frameworks
- **Production-ready infrastructure** - Built-in checkpointing, observability, guardrails, and MCP server integration
- **Flexible deployment** - Run locally for development, deploy to self-hosted infrastructure, or use managed cloud
- **Framework-agnostic tooling** - CLI and web dashboard work consistently across all agent types

## Why Choose Idun?

- **Multi-Framework Support**: Deploy LangGraph graphs, Haystack pipelines, and ADK agents through a single unified interface. Switch frameworks without changing your deployment pipeline or tooling.
- **Production-Ready Features**: Checkpointing for conversation persistence, observability with Langfuse/Phoenix/GCP, guardrails for content safety, and MCP servers for tool integration—all configured through YAML.
- **Simple Configuration**: Define your agent, observability, guardrails, and tools. No complex setup scripts or framework-specific deployment code required.
- **Centralized Management**: Control multiple agents through a web dashboard or CLI. Create, configure, deploy, and monitor agents from one place.

## Key Features

### Observability

Integrate with multiple observability providers simultaneously. Track LLM calls, measure costs, monitor performance, and debug agent behavior.

Supported providers:

- **Langfuse** - LLM-specific tracing with cost tracking
- **Phoenix** - OpenTelemetry-based ML observability
- **GCP Logging/Trace** - Cloud-native logging and distributed tracing
- **LangSmith** - LangChain ecosystem monitoring

### Guardrails

Add safety constraints to filter harmful content and enforce compliance. Powered by Guardrails AI Hub.

Available validators:

- **Ban List** - Block specific words or phrases
- **PII Detector** - Detect and handle personally identifiable information

Configure input validation (before processing) and output validation (before returning responses).

### MCP Servers

Extend agent capabilities with Model Context Protocol servers. Idun manages server lifecycle, connection management, and tool registration automatically.

Common integrations:

- Filesystem access
- Web search (Brave, Google)
- Database connections
- API integrations
- Git repositories

### Memory & Checkpointing

Persist conversation state across requests. Resume conversations after failures or restarts. Support multiple concurrent conversations with thread isolation.

Supported backends:

- SQLite (local development)
- PostgreSQL (production)
- In-memory (stateless testing)
- Vertex AI (Google Cloud production)

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

### Idun Cloud

Managed hosting with zero infrastructure management. Automatic scaling, built-in high availability, and integrated observability. (Coming Soon)

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

- **Web Dashboard**: User interface for creating and managing agents
- **Manager (Control Plane)**: REST API for agent CRUD operations, configuration management, and authentication. Handles observability and guardrails configuration.
- **Engine (Runtime)**: Loads and executes agents through framework-specific adapters (LangGraph, Haystack, ADK). Manages observability, guardrails, MCP servers, and provides REST API access.
- **Data Layer**: PostgreSQL for checkpointing and configuration storage. MCP servers for tool integrations.

---

# Getting Started

This guide will walk you through setting up the Idun Agent Platform and deploying your first agent.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12** - Required for running the agent platform [Install Python](https://www.python.org/downloads/)
- **Docker** and **Docker Compose** - Required for running the platform containers. [Steps to install Docker](https://docs.docker.com/get-started).
- **Git** - For cloning the repository
- **uv** - For Python package management. [Steps to install uv](https://docs.astral.sh/uv/getting-started/installation/)

## 1. Clone the Repository

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
```

## 2. Copy env file

```bash
cp .env.example .env
```

## 3. Start the Platform

> **Tip**: Make sure you start the Docker daemon before running the container

Launch the Docker containers:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The manager UI will be available at `http://localhost:3000`

## 4. Create an Agent configuration

Navigate to `http://localhost:3000`, press login (without specifying credentials).

1. Click on "Create an agent"
2. **Name**: Specify your agent's name, set it to `My first agent`.
3. **Base url**: Add the URL your agents will be accessed from, set it to `http://localhost:8008`.
4. **Server Port**: For local development, set it to `8008`.
5. **Agent framework**: Select `ADK` (Agent development kit by Google).
6. Click `Next`.
7. **Name**: Specify your agent's name, set it to `My first agent` (if asked again).
8. **Agent Definition Path**: Specify where your agent code will be located, set it to `my_agent/agent.py:root_agent`
9. **App Name**: ADK requires an app name so set it to `firstagent`
10. For `session service` and `observability` keep default value. This will be addressed later (By default agent memory is set to `AdkInMemory`).
11. Click `Next`.
12. Skip `MCP Server` and `Guardrails`. This will be addressed later.
13. Click `Create Agent`.

> **Success**: Your agent's configuration is created

## 5. Get the Agent API Key

In the Agent Dashboard, click on your agent, then `API Integration`, and press `Show Key`. Copy your agent's KEY. We will use it in the next step.

## 6. Create your Agent

Now the idun agent platform is ready. You can start developing agents and connect them to the platform.
Start a new agent project with your favorite code editor in a separate folder like you're starting a new agent project.
In this example we will start with a simple ADK agent.

### Step 1: Create the Project Directory

```bash
mkdir demo-adk-idun-agent
cd demo-adk-idun-agent
```

### Step 2: Init ADK agent

In your code editor setup a Python 3.12 environment.

Follow the ADK Agent python getting started tutorial: [Python Quickstart for ADK](https://google.github.io/adk-docs/get-started/python/#next-build-your-agent)

> **Tips**:
>
> - If you are using Vertex AI model don't forget to authenticate your gcloud account:
>
>   ```bash
>   gcloud auth application-default login
>   ```
> - Keep using gemini 2.5 instead of gemini 3 pro preview if you didn't activate gemini preview or if you don't use us-central1 as location: `gemini-2.5-flash`
> - When running ADK web use a different port because port 8000 is used by the platform: `adk web --port 8010`
> - ADK does not support folder paths that contain spaces.

### Step 3: Setup Idun platform access

Install idun-agent-engine package:

```bash
pip install idun-agent-engine
```

Copy the following key in your agent .env file.

```bash
IDUN_MANAGER_HOST=http://localhost:8000
IDUN_AGENT_API_KEY=<COPY THE AGENT IDUN KEY FROM PREVIOUS STEP 5>
```

### Step 4: Run your agent

Export the env variable from the .env in your terminal

```bash
set -o allexport
source ./my_agent/.env
set +o allexport
```

Run the agent with the following command

```bash
idun agent serve --source manager
```

> **Success**: Your ADK agent is up and running with Idun agent platform!

## 7. Test your agent

Navigate to the API Integration tab of your agent in the manager UI to communicate with your agent.

Test the following question:

```text
What time is it in Paris ?
```

> **Success**: You're all done!

---

## Getting Help

- **Documentation**: [Guides, Concepts, Reference](https://idun-group.github.io/idun-agent-platform/)
- **Community**: [GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions)
- **Issues**: [Report bugs and request features](https://github.com/Idun-Group/idun-agent-platform/issues)
- **Discord**: [Discuss with us](https://discord.gg/N6ppGPrw)
