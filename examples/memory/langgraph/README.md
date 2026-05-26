# Memory (LangGraph + SQLite)

LangGraph chatbot with persistent conversation memory backed by a local SQLite database. The agent itself stores nothing. LangGraph's checkpointer writes a snapshot of the graph state at every super-step, keyed by `thread_id`.

Same agent code works against Postgres in production; only the `checkpointer:` block changes.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Open `http://localhost:8000`. Send two messages in the same thread:

1. *"My name is Pierre."*
2. *"What is my name?"*

The second response remembers `Pierre`. Restart with `idun init` and ask again with the same thread; the answer survives because the state is on disk in `conversations.db`.

## Switching to Postgres

Replace the `checkpointer:` block:

```yaml
checkpointer:
  type: postgres
  db_url: "postgresql://user:pass@host:5432/dbname"
```

The engine provisions the schema and uses `AsyncPostgresSaver` from `langgraph.checkpoint.postgres.aio`.

## How it works

The LangGraph adapter wires the configured checkpointer into the compiled graph at `initialize()` time. Every node return value triggers a checkpoint write. `aget_state(thread_id)` rehydrates the full history on the next request with the same `thread_id`.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py) (`_setup_persistence`).
