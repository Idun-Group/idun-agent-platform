# Local Deployment

## Overview

Run Idun agents on your local machine for development and testing.

## Quick Start

### 1. Install

```bash
pip install idun-agent-engine
```

### 2. Create Agent Code

Create `agent.py`:

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class State(TypedDict):
    query: str
    response: str

def process(state: State):
    return {"response": f"Processed: {state['query']}"}

workflow = StateGraph(State)
workflow.add_node("process", process)
workflow.set_entry_point("process")
workflow.add_edge("process", END)

graph = workflow.compile()
```

### 3. Create Configuration

Create `config.yaml`:

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

### 4. Run Agent

```bash
idun agent serve --source=file --path=./config.yaml
```

Your agent is now running at `http://localhost:8000`

## Testing

```bash
curl -X POST http://localhost:8000/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello", "session_id": "test-123"}'
```

## Configuration Options

### Different Port

```yaml
server:
  api:
    port: 8080
```

### PostgreSQL Checkpointing

```yaml
agent:
  config:
    checkpointer:
      type: "postgres"
      db_url: "postgresql://user:pass@localhost:5432/dbname"
```

### Add Observability

```yaml
observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"
```

## Next Steps

- [Full Configuration Guide →](../guides/01-basic-configuration.md)
- [Set Up Observability →](../guides/02-observability-checkpointing.md)
- [Add Guardrails →](../guides/04-guardrails.md)
