# Example 1: Basic Configuration File

This example demonstrates the most straightforward way to use the Idun Agent Engine - with a YAML configuration file.

## 📋 What This Example Shows

- How to define agent configuration in YAML
- Simple server startup with file-based configuration
- Basic LangGraph agent integration
- SQLite checkpointer setup

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   pip install fastapi uvicorn langgraph aiosqlite pydantic
   ```

2. **Run the example**:
   ```bash
   python main.py
   ```

3. **Test the agent**:
   ```bash
   curl -X POST "http://localhost:8000/agent/invoke" \
     -H "Content-Type: application/json" \
     -d '{"query": "Hello!", "session_id": "test-session"}'
   ```

## 📁 Files in This Example

- **`main.py`**: Entry point that loads config and starts the server
- **`config.yaml`**: Configuration file defining the agent and Engine settings
- **`example_agent.py`**: Simple LangGraph agent implementation
- **`README.md`**: This documentation

## 🔧 Configuration Breakdown

### Engine Section
```yaml
engine:
  api:
    port: 8000          # Server port
  telemetry:
    provider: "langfuse" # Telemetry provider
```

### Agent Section
```yaml
agent:
  type: "langgraph"     # Agent framework type
  config:
    name: "Example Agent"                    # Human-readable name
    graph_definition: "example_agent.py:app" # Path to your agent
    checkpointer:                           # Optional persistence
      type: "sqlite"
      db_url: "sqlite:///example_checkpoint.db"
```

## 🎯 Key Benefits

- **Declarative**: Configuration is separate from code
- **Version Control Friendly**: YAML files are easy to track and diff
- **Environment Specific**: Different configs for dev/staging/prod
- **Non-Technical Friendly**: Operations teams can modify configs without touching code

## 🔄 Variations

You can modify the configuration to:

- Change the port: `engine.api.port: 8080`
- Disable checkpointing: Remove the `checkpointer` section
- Use a different database file: Change the `db_url`
- Rename your agent: Modify the `name` field

## 📚 Next Steps

- Check out [Example 2](../02_programmatic_config/) for programmatic configuration
- Check out [Example 3](../03_minimal_setup/) for the most minimal setup
- Read the [full Engine documentation](../../README_USER_API.md)
