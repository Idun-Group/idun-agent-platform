# Memory for ADK Agent

ADK agents use **session services** and **memory services** to manage conversational context. These services work together to maintain conversation state and enable long-term memory storage, allowing agents to remember previous interactions and persist context across sessions.

[ADK Sessions documentation](https://google.github.io/adk-docs/sessions/)

![Memory/Session configuration in ADK Agent form](../images/screenshots/adk-memory.png)

## Overview

ADK provides two complementary services for managing agent context:

### Session Service

Manages the lifecycle of **Session** objects, which represent individual conversations. A session contains:

- **Events**: Chronological sequence of messages and actions during the interaction
- **State**: Temporary data relevant only during the current conversation (e.g., shopping cart items, user preferences)

### Memory Service

Manages **Memory**, a long-term knowledge store that spans multiple sessions. Memory acts as a searchable knowledge base that the agent can query to recall information beyond the immediate conversation.

**Supported Session Services:** In Memory, Vertex AI, Database
**Supported Memory Services:** In Memory, Vertex AI

## Setup

During agent creation:

1. Navigate to the **Memory** step
2. The available options depend on your selected agent framework
3. Configure your **Session Service** (required for conversation state):
   - Choose from: In Memory, Vertex AI, or Database
   - Fill in connection details if required
4. Configure your **Memory Service** (optional, for long-term memory):
   - Choose from: In Memory or Vertex AI
   - Fill in connection details if required
5. Click **Next** to continue

!!! success
    Your ADK agent has memory enabled. Session state and messages will be persisted, and long-term memory will be available for your agent to improve its responses.

<br>

---

<br>

## Session Service Options

Session services manage conversation state and events for individual sessions.

### In Memory Session Service

The `InMemorySessionService` stores session data in the application's memory.

**Characteristics:**

- **Persistence**: Data is lost when the application restarts
- **Performance**: Fastest option, no I/O overhead
- **Use Cases**: Development, testing, stateless workflows, quick prototyping

**Configuration:** No additional configuration required.

### Vertex AI Session Service

The `VertexAiSessionService` utilizes Google Cloud's Vertex AI infrastructure for session management.

**Characteristics:**

- **Persistence**: Cloud-native, persistent storage
- **Scalability**: Handles high-volume, distributed deployments
- **Integration**: Seamless integration with other Google Cloud services
- **Use Cases**: Production deployments on Google Cloud, scalable applications

**Configuration:** Requires:

- `project_id`: Google Cloud project ID
- `location`: GCP region (e.g., `us-central1`)
- `reasoning_engine_app_name`: Vertex AI Reasoning Engine application name

### Database Session Service

The `DatabaseSessionService` connects to a relational database (PostgreSQL, MySQL, etc.) for persistent session storage using SQLAlchemy.

**Characteristics:**

- **Persistence**: Robust SQL-based storage
- **Scalability**: Supports multi-instance deployments
- **Reliability**: Production-grade database features (transactions, backups)
- **Use Cases**: Production deployments requiring SQL persistence, multi-instance setups

**Configuration:** Requires:

- `db_url`: Database connection string (e.g., `postgresql://user:pass@localhost:5432/dbname`)

## Memory Service Options

Memory services manage long-term knowledge storage that persists across multiple sessions.

### In Memory Memory Service

The `InMemoryMemoryService` provides ephemeral memory storage.

**Characteristics:**

- **Persistence**: Data is lost when the application restarts
- **Performance**: Fast access, no external dependencies
- **Use Cases**: Development, testing, scenarios where long-term memory isn't required

**Configuration:** No additional configuration required.

### Vertex AI Memory Service

The `VertexAiMemoryService` provides cloud-backed memory with long-term storage using Vertex AI Memory Banks.

**Characteristics:**

- **Persistence**: Long-term, persistent storage across sessions
- **Scalability**: Cloud-native, handles large knowledge bases
- **Search**: Semantic search capabilities for retrieving relevant memories
- **Use Cases**: Production deployments requiring long-term memory, knowledge-intensive applications

**Configuration:** Requires:

- `project_id`: Google Cloud project ID
- `location`: GCP region
- `memory_bank_resource_id`: Vertex AI Memory Bank resource ID

## Best Practices

### Session Service Best Practices

- **Use In Memory for local development** - Simple and fast for testing, no setup required
- **Use Database for production** - Reliable SQL-based persistence, supports multi-instance deployments
- **Use Vertex AI for Google Cloud production** - Cloud-native, scalable, integrates with other GCP services
- **Configure session isolation** - Ensure each conversation has a unique session ID to prevent state leakage

### Memory Service Best Practices

- **Use In Memory for development** - Fast iteration, no external dependencies
- **Use Vertex AI for production** - Long-term persistence, semantic search capabilities
- **Ingest session data into memory** - Periodically move important information from sessions to long-term memory
- **Use semantic search** - Leverage Vertex AI's search capabilities to retrieve relevant memories

### General Best Practices

- **Separate concerns** - Use session service for conversation state, memory service for long-term knowledge
- **Monitor storage usage** - Long-running sessions and large memory stores can consume significant resources
- **Backup strategies** - Implement regular backups for production database and Vertex AI configurations

## Troubleshooting

### Session Service Troubleshooting

1. **Database connection errors**:
   - Verify the connection string format and credentials
   - Test the connection independently using a database client
   - Ensure the database server is accessible from the agent

2. **Vertex AI authentication**:
   - Verify Google Cloud credentials are properly configured
   - Check that the service account has necessary permissions
   - Ensure the project ID and location are correct

3. **Session not persisting**:
   - Verify the session service is properly initialized
   - Check that session IDs are being used consistently
   - Review session service logs for errors

### Memory Service Troubleshooting

1. **Vertex AI Memory Bank**:
   - Verify the Memory Bank resource ID is correct
   - Check that the Memory Bank exists in the specified project and location
   - Ensure proper IAM permissions for accessing Memory Banks

2. **Memory not accessible**:
   - Verify the memory service is properly initialized
   - Check memory service configuration matches your setup
   - Review memory service logs for errors

### General Troubleshooting

1. **Review logs**: Look for session and memory-related errors in agent logs
2. **Check permissions**: Ensure the agent has appropriate access to all storage resources
3. **Verify configuration**: Double-check all connection strings, credentials, and resource IDs

## Next Steps

- [Configure guardrails](../concepts/guardrails.md) to add safety constraints to your agent
- [Explore MCP servers](../mcp/overview.md) to extend your agent's capabilities
- [Learn about deployment](../concepts/deployment.md) options for production
