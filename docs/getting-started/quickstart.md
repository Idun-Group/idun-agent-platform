# Getting Started

This guide will walk you through setting up the Idun Agent Platform and deploying your first agent.
<div align="center" style="margin: 2em 0;">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/1QJbSrfz5tU" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="max-width: 100%; border-radius: 8px;"></iframe>
</div>
## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12** - Required for running the agent platform [Install Python](https://www.python.org/downloads/){:target="_blank"}
- **Docker** and **Docker Compose** - Required for running the platform containers. [Steps to install Docker](https://docs.docker.com/get-started){:target="_blank"}.
- **Git** - For cloning the repository
- **uv** - For Python package management. [Steps to install uv](https://docs.astral.sh/uv/getting-started/installation/){:target="_blank"}

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

!!! tip
    Make sure you start the Docker daemon before running the container

Launch the Docker containers:

```bash
docker compose -f docker-compose.dev.yml up --build
```

## 4. Access the platform

The manager UI will be available at `http://localhost:3000`

Login, if you didn't setup any login methiod yet just press **Login**.

!!! success "Congratulations"
    The Idun Agent Platform is ready to use !
    You can now start to plug your agents and set Observabily, Memory, MCP, Guardrails and production grade API.

**Next →** [Use a ADK Agent](../agent-frameworks/adk.md)

**Next →** [Use a LangGraph Agent](../agent-frameworks/langgraph.md)

## Next Steps

- [Observability](../observability/overview.md.md) - Monitor your agent's performance and add checkpointing
- [Memory](../memory/overview.md) - Add memory to your agents
- [MCP](../mcp/configuration.md) - Give MCP tools to your agents
- [Guardrails](../guardrails/overview.md) - Protect your agents with Guardrails
- [A2A](../a2a/overview.md) - Enable A2A (Agent-to-Agent) capabilities to your agents
