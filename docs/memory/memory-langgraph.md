# Memory for LangGraph Agent

LangGraph agents use **checkpointing** to save your agent's state during execution, enabling recovery from failures, resuming conversations, and maintaining context across interactions.

[LangGraph checkpointing persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence)

## Overview

Checkpointing is LangGraph's built-in persistence layer that saves a snapshot of the graph state at every super-step. These checkpoints are saved to a **thread**, which allows you to access the graph's state after execution. This enables powerful capabilities including:

- **Memory**: Maintain context between interactions in conversations
- **Human-in-the-loop**: Inspect, interrupt, and approve graph steps
- **Time Travel**: Replay prior executions and debug specific steps
- **Fault-tolerance**: Resume from the last successful step after failures

**Supported Checkpointing Backends:** InMemory, SQLite, PostgreSQL

![Memory/Checkpointing configuration in LangGraph Agent form](../images/screenshots/langgraph-memory.png)

## Setup

During agent creation:

1. Navigate to the **Checkpointing** step
2. The available options depend on your selected agent framework
3. Choose your backend (SQLite for development, PostgreSQL for production)
4. Fill in the connection details
5. Click **Next** to continue

!!! success
    Your LangGraph agent has memory enabled. Its state and messages will be persisted and usable by your agent to improve its logic.

<br>

---

<br>

## Checkpointing Backends

### InMemory

The `InMemorySaver` stores checkpoints in the application's memory. This is the simplest option with no external dependencies.

**Characteristics:**

- **Persistence**: Data is lost when the application restarts
- **Performance**: Fastest option, no I/O overhead
- **Use Cases**: Development, testing, stateless workflows

**Configuration:** No additional configuration required.

### SQLite

The `SqliteSaver` uses a file-based SQLite database to store checkpoints. Ideal for local development and single-instance deployments.

**Characteristics:**

- **Persistence**: Data persists on disk in a single file
- **Performance**: Fast for single-process applications
- **Concurrency**: Limited to single-writer scenarios
- **Use Cases**: Local development, small-scale applications

**Configuration:** Requires a database file path (e.g., `checkpoints.db`).

### PostgreSQL

The `PostgresSaver` uses PostgreSQL for checkpoint storage. Recommended for production deployments requiring scalability and concurrent access.

**Characteristics:**

- **Persistence**: Robust, production-grade database storage
- **Performance**: Optimized for multi-process and concurrent access
- **Scalability**: Supports multiple agent instances
- **Use Cases**: Production deployments, multi-instance setups

**Configuration:** Requires a PostgreSQL connection string.

## Threads and State

### Threads

A **thread** is a unique identifier (`thread_id`) that groups related checkpoints together. Each conversation or interaction should use a unique `thread_id` to maintain isolation between different sessions.

When invoking a graph with a checkpointer, you **must** specify a `thread_id`:

```python
config = {"configurable": {"thread_id": "user-123-session-1"}}
```

### State Snapshots

Each checkpoint contains a `StateSnapshot` with:

- **values**: The state channel values at that point in time
- **config**: Configuration associated with the checkpoint
- **metadata**: Additional metadata about the checkpoint
- **next**: Nodes to execute next in the graph

You can retrieve the latest state or a specific checkpoint using `graph.get_state(config)`.

## Best Practices

- **Use SQLite for local development** - Simple file-based storage, no server setup required
- **Use PostgreSQL for production** - Multi-process support, reliability, and scalability
- **Use InMemory for testing** - Fastest option for stateless testing scenarios
- **Configure thread isolation** - Each conversation should have a unique `thread_id`
- **Monitor checkpoint storage** - Long-running conversations can accumulate significant state

## Troubleshooting

1. **Verify database connection**: Test the connection string independently before configuring
2. **Check permissions**: Ensure the agent has read/write access to the database or file system
3. **Thread ID required**: Always provide a `thread_id` in the config when using checkpointers
4. **Database schema**: PostgreSQL checkpointers automatically create required tables on first use
5. **Review logs**: Look for checkpoint-related errors in agent logs for detailed error messages

## Next Steps

- [Configure guardrails](../concepts/guardrails.md) to add safety constraints to your agent
- [Explore MCP servers](../concepts/configuration.md) to extend your agent's capabilities
- [Learn about deployment](../concepts/deployment.md) options for production
