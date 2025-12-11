# Memory for Langgraph Agent

Langgraph agent use checlpoint to saves your agent's state during execution, enabling recovery from failures and resuming conversations.

[LangGraph checkpointing persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence)

We will see how to add memory to your Langgraph Agent. 

**Supported Checkpointing:** InMemory, SQLite, Postgres

![Memory/Checkpointing configuration in LangGraph Agent form](../images/screenshots/langgraph-memory.png)

### Setup

During agent creation:

1. Navigate to the **Checkpointing** step
2. The available options depend on your selected agent framework
3. Choose your backend (SQLite for development, PostgreSQL for production)
4. Fill in the connection details
5. Click **Next** to continue

!!! success
    Your Langgraph agent as memory enabled. His State and messages will ne persisted and usable by yoru agent to improve his logic.

<br>

---

<br>

## Best Practices

- **Use SQLite for local development**
- **Postgres** for production checkpointing

## Troubleshooting

1. **Verify database connection**: Test the connection string independently
2. **Check permissions**: Ensure the agent has write access to the database
3. **Review logs**: Look for checkpoint-related errors in agent logs

## Next Steps

- [Configure guardrails](../concepts/guardrails.md) to add safety constraints to your agent
- [Explore MCP servers](../concepts/configuration.md) to extend your agent's capabilities
- [Learn about deployment](../concepts/deployment.md) options for production
