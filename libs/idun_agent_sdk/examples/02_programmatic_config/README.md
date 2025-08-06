# Example 2: Programmatic Configuration

This example demonstrates how to configure your agent programmatically using the `ConfigBuilder` API, without needing YAML files.

## 📋 What This Example Shows

- Using the fluent `ConfigBuilder` API
- Building configuration in Python code
- Dynamic configuration based on environment variables
- Multiple agent configurations in one script

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   pip install fastapi uvicorn langgraph aiosqlite pydantic
   ```

2. **Run the example**:
   ```bash
   python main.py
   ```

3. **Run with custom port**:
   ```bash
   PORT=8080 python main.py
   ```

4. **Test the agent**:
   ```bash
   curl -X POST "http://localhost:8000/agent/invoke" \
     -H "Content-Type: application/json" \
     -d '{"query": "Hello ConfigBuilder!", "session_id": "test-session"}'
   ```

## 📁 Files in This Example

- **`main.py`**: Entry point demonstrating ConfigBuilder usage
- **`smart_agent.py`**: A more advanced LangGraph agent
- **`README.md`**: This documentation

## 🔧 ConfigBuilder Features

### Basic Usage
```python
from idun_agent_sdk import ConfigBuilder

config = (ConfigBuilder()
          .with_api_port(8080)
          .with_telemetry("langfuse")
          .with_langgraph_agent(
              name="My Agent",
              graph_definition="agent.py:graph",
              sqlite_checkpointer="agent.db")
          .build())
```

### Advanced Features
```python
# Environment-based configuration
import os

config = (ConfigBuilder()
          .with_api_port(int(os.getenv("PORT", 8000)))
          .with_langgraph_agent(
              name=f"Agent-{os.getenv('ENVIRONMENT', 'dev')}",
              graph_definition="smart_agent.py:app",
              sqlite_checkpointer=f"{os.getenv('ENVIRONMENT', 'dev')}_agent.db")
          .build())
```

## 🎯 Key Benefits

- **Type Safety**: IDE autocompletion and type checking
- **Dynamic**: Configure based on runtime conditions
- **Validation**: Immediate feedback on configuration errors
- **Composable**: Build configurations from smaller pieces
- **Testable**: Easy to unit test configuration logic

## 🔄 Variations

The example shows different configuration approaches:

1. **Basic Configuration**: Simple hardcoded values
2. **Environment-Based**: Using environment variables
3. **Conditional Logic**: Different configs based on conditions
4. **Save to File**: Export configuration as YAML

## 📚 Next Steps

- Check out [Example 1](../01_basic_config_file/) for YAML-based configuration
- Check out [Example 3](../03_minimal_setup/) for the most minimal setup
- Read about [ConfigBuilder API](../../README_USER_API.md#configuration-reference)
- Learn about [custom agent types](../../README_USER_API.md#supported-agent-types) 