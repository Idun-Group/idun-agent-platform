# Idun Agent Engine

Turn any LangGraph-based agent into a production-grade API in minutes.

Idun Agent Engine is a lightweight runtime and SDK that wraps your agent with a FastAPI server, adds streaming, structured responses, config validation, and optional observability — with zero boilerplate. Use a YAML file or a fluent builder to configure and run.

## Installation

```bash
pip install idun-agent-engine
```

- Requires Python 3.13
- Ships with FastAPI, Uvicorn, LangGraph, SQLite checkpointing, and optional observability hooks

## Quickstart

### 1) Minimal one-liner (from a YAML config)

```python
from idun_agent_engine.core.server_runner import run_server_from_config

run_server_from_config("config.yaml")
```

Example `config.yaml`:

```yaml
server:
  api:
    port: 8000

agent:
  type: "langgraph"
  config:
    name: "My Example LangGraph Agent"
    graph_definition: "./examples/01_basic_config_file/example_agent.py:app"
    # Optional: conversation persistence
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///example_checkpoint.db"
    # Optional: provider-agnostic observability
    observability:
      provider: langfuse   # or phoenix
      enabled: true
      options:
        host: ${LANGFUSE_HOST}
        public_key: ${LANGFUSE_PUBLIC_KEY}
        secret_key: ${LANGFUSE_SECRET_KEY}
        run_name: "idun-langgraph-run"
```

Run and open docs at `http://localhost:8000/docs`.

### 2) Programmatic setup with the fluent builder

```python
from pathlib import Path
from idun_agent_engine import ConfigBuilder, create_app, run_server

config = (
    ConfigBuilder()
    .with_api_port(8000)
    .with_langgraph_agent(
        name="Programmatic Example Agent",
        graph_definition=str(Path("./examples/02_programmatic_config/smart_agent.py:app")),
        sqlite_checkpointer="programmatic_example.db",
    )
    .build()
)

app = create_app(engine_config=config)
run_server(app, reload=True)
```

## Endpoints

All servers expose these by default:

- POST `/agent/invoke`: single request/response
- POST `/agent/stream`: server-sent events stream of `ag-ui` protocol events
- GET `/health`: service health with engine version
- GET `/`: root landing with links

Invoke example:

```bash
curl -X POST "http://localhost:8000/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello!", "session_id": "user-123"}'
```

Stream example:

```bash
curl -N -X POST "http://localhost:8000/agent/stream" \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me a story", "session_id": "user-123"}'
```

## LangGraph integration

Point the engine to a `StateGraph` variable in your file using `graph_definition`:

```python
# examples/01_basic_config_file/example_agent.py
import operator
from typing import Annotated, TypedDict
from langgraph.graph import END, StateGraph

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]

def greeting_node(state):
    user_message = state["messages"][-1] if state["messages"] else ""
    return {"messages": [("ai", f"Hello! You said: '{user_message}'")]}

graph = StateGraph(AgentState)
graph.add_node("greet", greeting_node)
graph.set_entry_point("greet")
graph.add_edge("greet", END)

# This variable name is referenced by graph_definition
app = graph
```

Then reference it in config:

```yaml
agent:
  type: "langgraph"
  config:
    graph_definition: "./examples/01_basic_config_file/example_agent.py:app"
```

Behind the scenes, the engine:

- Validates config with Pydantic models
- Loads your `StateGraph` from disk
- Optionally wires a SQLite checkpointer via `langgraph.checkpoint.sqlite`
- Exposes `invoke` and `stream` endpoints
- Bridges LangGraph events to `ag-ui` stream events

## Observability (optional)

Enable provider-agnostic observability via the `observability` block in your agent config. Today supports Langfuse and Arize Phoenix (OpenInference) patterns; more coming soon.

```yaml
agent:
  type: "langgraph"
  config:
    observability:
      provider: langfuse   # or phoenix
      enabled: true
      options:
        host: ${LANGFUSE_HOST}
        public_key: ${LANGFUSE_PUBLIC_KEY}
        secret_key: ${LANGFUSE_SECRET_KEY}
        run_name: "idun-langgraph-run"
```

## Configuration reference

- `server.api.port` (int): HTTP port (default 8000)
- `agent.type` (enum): currently `langgraph` (CrewAI placeholder exists but not implemented)
- `agent.config.name` (str): human-readable name
- `agent.config.graph_definition` (str): absolute or relative `path/to/file.py:variable`
- `agent.config.checkpointer` (sqlite): `{ type: "sqlite", db_url: "sqlite:///file.db" }`
- `agent.config.observability` (optional): provider options as shown above

Config can be sourced by:

- `engine_config` (preferred): pass a validated `EngineConfig` to `create_app`
- `config_dict`: dict validated at runtime
- `config_path`: path to YAML; defaults to `config.yaml`

## Examples

The `examples/` folder contains complete projects:

- `01_basic_config_file`: YAML config + simple agent
- `02_programmatic_config`: `ConfigBuilder` usage and advanced flows
- `03_minimal_setup`: one-line server from config

Run any example with Python 3.13 installed.

## CLI and runtime helpers

Top-level imports for convenience:

```python
from idun_agent_engine import (
  create_app,
  run_server,
  run_server_from_config,
  run_server_from_builder,
  ConfigBuilder,
)
```

- `create_app(...)` builds the FastAPI app and registers routes
- `run_server(app, ...)` runs with Uvicorn
- `run_server_from_config(path, ...)` loads config, builds app, and runs
- `run_server_from_builder(builder, ...)` builds from a builder and runs

## Production notes

- Use a process manager (e.g., multiple Uvicorn workers behind a gateway). Note: `reload=True` is for development and incompatible with multi-worker mode.
- Mount behind a reverse proxy and enable TLS where appropriate.
- Persist conversations using the SQLite checkpointer in production or replace with a custom checkpointer when available.

## Roadmap

- CrewAI adapter (placeholder exists, not yet implemented)
- Additional stores and checkpointers
- First-class CLI for `idun` commands

## Contributing

Issues and PRs are welcome. See the repository:

- Repo: `https://github.com/geoffreyharrazi/idun-agent-platform`
- Package path: `libs/idun_agent_engine`
- Open an issue: `https://github.com/geoffreyharrazi/idun-agent-platform/issues`

Run locally:

```bash
cd libs/idun_agent_engine
poetry install
poetry run pytest -q
```

## License

MIT — see `LICENSE` in the repo root.
