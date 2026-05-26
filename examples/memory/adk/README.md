# Memory (Google ADK + SQLite)

ADK chatbot whose sessions persist to a local SQLite file via ADK's `DatabaseSessionService`. Sessions identified by the same `thread_id` survive process restarts.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine google-adk
idun init
```

Open `http://localhost:8000`. Send two messages in the same thread:

1. *"My name is Pierre."*
2. *"What is my name?"*

The second response remembers `Pierre`. Restart with `idun init` and ask again with the same thread; ADK reloads the session from `conversations.db`.

## Switching to Postgres

Replace the `session_service.db_url` with a Postgres URL that names an async driver (`asyncpg` or `psycopg` v3):

```yaml
session_service:
  type: database
  db_url: "postgresql+asyncpg://user:pass@host:5432/dbname"
```

## URL format gotcha

`DatabaseSessionService` calls `create_async_engine(db_url)`. Plain `sqlite:///conversations.db` and `postgresql://...` URLs resolve to the SYNC SQLAlchemy drivers and fail at engine creation with `Failed to create database engine`. Use the `+async-driver` form:

- SQLite: `sqlite+aiosqlite:///conversations.db`
- Postgres: `postgresql+asyncpg://...` or `postgresql+psycopg://...`

## How it works

The ADK adapter instantiates `google.adk.sessions.DatabaseSessionService(db_url=...)` and passes it into the ADK `Runner` and `ADKAGUIAgent` wrapper. ADK manages session lifecycle (create / get / append events) against that DB. The `memory_service` here is `in_memory`; swap to `vertex_ai` for long-term recall once a real memory bank is provisioned.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py) (`_initialize_session_service`).
