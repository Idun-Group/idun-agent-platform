# Deployment

## Overview

Idun Agent Platform supports two deployment options:

**Local Development** - Run agents on your local machine using the CLI. This is the primary way to run agents currently.

**Idun Cloud** - Fully managed hosting (coming soon).

## Local Deployment

Run agents locally using the Idun CLI:

```bash
idun agent serve --source=file --path=./config.yaml
```

This starts your agent with:
- REST API at `http://localhost:8000`
- Automatic configuration loading
- SQLite or PostgreSQL checkpointing (as configured)
- Observability integration (if configured)

### Prerequisites

- Python 3.12+
- Virtual environment (venv, uv, or conda)
- Agent code and configuration file

### Configuration

Create a `config.yaml` file:

```yaml
server:
  api:
    port: 8000

agent:
  type: "LANGGRAPH"
  config:
    name: "My Agent"
    graph_definition: "./agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "checkpoints.db"
```

### Running the Agent

```bash
# Install dependencies
pip install idun-agent-engine

# Start the agent
idun agent serve --source=file --path=./config.yaml

# Agent is now running at http://localhost:8000
```

### Testing the Agent

```bash
# Invoke endpoint
curl -X POST http://localhost:8000/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello", "session_id": "test-123"}'
```

## Idun Cloud

Fully managed platform for deploying AI agents with zero infrastructure management.

**Status:** Coming soon

Features will include:
- One-click deployment from Git repositories
- Automatic scaling and high availability
- Built-in observability dashboards
- Managed PostgreSQL for checkpointing
- Custom domains and SSL

**Learn more:** [Idun Cloud Documentation →](idun-cloud.md)

## Next Steps

- [Quick Start Guide →](../getting-started/quickstart.md)
- [Configuration Reference →](../reference/configuration.md)
- [Set Up Observability →](../observability/setup-guide.md)
