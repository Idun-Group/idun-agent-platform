# Memory

## Overview

Memory enables agents to maintain state and context across conversations, allowing them to remember previous interactions and resume conversations after failures or restarts.

The Idun Agent Platform supports multiple memory and checkpointing strategies depending on your agent framework:

- **LangGraph**: Checkpointing for conversation state persistence
- **ADK**: Session services and memory services for state and long-term memory
- **Haystack**: Stateless pipelines (no built-in memory)

## Checkpointing (LangGraph)

Checkpointing saves your agent's state during execution, enabling recovery from failures and resuming conversations.

**Supported Backends:**

- **SQLite**: File-based persistence, ideal for local development
- **PostgreSQL**: Multi-process, production-ready with concurrent access
- **In-Memory**: No persistence, fastest for stateless testing

**Key Features:**

- Thread isolation - each `session_id` maps to a unique thread
- State persistence across requests
- Resume conversations after failures or restarts
- Concurrent conversation support

[Checkpointing Setup Guide →](../observability/setup-guide.md#checkpointing)

## Session Services (ADK)

ADK agents use session services to manage conversation state:

- **InMemory**: Development/testing, ephemeral state
- **Database**: SQL-based persistence with SQLAlchemy
- **VertexAI**: Cloud-native session management on Google Cloud

## Memory Services (ADK)

ADK agents support separate memory services for long-term storage:

- **InMemory**: Ephemeral memory, no persistence
- **VertexAI**: Cloud-backed memory with long-term storage

## Configuration

### LangGraph Checkpointing

```yaml
agent:
  type: "LANGGRAPH"
  config:
    checkpointer:
      type: "sqlite"
      db_url: "checkpoints.db"
```

For production:

```yaml
agent:
  type: "LANGGRAPH"
  config:
    checkpointer:
      type: "postgres"
      db_url: "postgresql://user:pass@localhost:5432/dbname"
```

### ADK Memory

```yaml
agent:
  type: "ADK"
  config:
    session_service:
      type: "in_memory"
    memory_service:
      type: "in_memory"
```

## Best Practices

- **Use SQLite for local development** - Simple file-based storage
- **Use PostgreSQL for production** - Multi-process support and reliability
- **Configure thread isolation** - Each conversation should have a unique `session_id`
- **Monitor memory usage** - Long-running conversations can accumulate state

## Related Documentation

- [Observability & Checkpointing Guide](../observability/setup-guide.md)
- [Configuration Reference](../reference/configuration.md)
- [Architecture Overview](../concepts/architecture.md#state-management)
