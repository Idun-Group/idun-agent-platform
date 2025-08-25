---
title: Getting Started
---

# Getting Started

This guide helps you run the Engine locally and explore the unified API.

## Prerequisites

- Python 3.13
- Docker (optional)

## Install the Engine

```bash
pip install idun-agent-engine
```

## Minimal config

```yaml
server:
  api:
    port: 8000

agent:
  type: "langgraph"
  config:
    name: "My Example LangGraph Agent"
    graph_definition: "./examples/01_basic_config_file/example_agent.py:app"
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///example_checkpoint.db"
```

## Run the server

```python
from idun_agent_engine.core.server_runner import run_server_from_config

run_server_from_config("config.yaml")
```

## Try the API

```bash
curl -X POST "http://localhost:8000/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello!", "session_id": "user-123"}'
```
