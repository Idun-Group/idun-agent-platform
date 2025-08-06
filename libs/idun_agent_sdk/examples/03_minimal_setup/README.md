# Example 3: Minimal Setup

This example demonstrates the absolute minimal way to get an agent running with the Idun Agent SDK - just one function call!

With the new ConfigBuilder umbrella functions, configuration resolution is now completely transparent and automatic.

## 📋 What This Example Shows

- The simplest possible server startup
- One-line agent deployment
- Automatic configuration resolution with ConfigBuilder
- Quick prototyping approach

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
     -d '{"query": "Hello minimal agent!", "session_id": "test-session"}'
   ```

## 📁 Files in This Example

- **`main.py`**: Ultra-minimal entry point (just a few lines!)
- **`config.yaml`**: Minimal configuration
- **`minimal_agent.py`**: The simplest possible LangGraph agent
- **`README.md`**: This documentation

## 🔧 The One-Liner Approach

The entire server can be started with just this:

```python
from idun_agent_sdk.core.server_runner import run_server_from_config

run_server_from_config("config.yaml", reload=True)
```

That's it! Behind the scenes, this uses `ConfigBuilder.resolve_config()` to automatically:
- Load and validate the YAML configuration
- Handle different configuration sources
- Provide helpful error messages
- Initialize the agent with proper lifecycle management

## ✨ What Happens Automatically

The new umbrella function `ConfigBuilder.resolve_config()` handles:

1. **Configuration Loading**: Automatically loads from YAML files
2. **Validation**: Uses Pydantic models to validate all settings
3. **Error Handling**: Provides clear error messages for invalid configs
4. **Fallbacks**: Gracefully handles missing or incorrect configurations
5. **Logging**: Informative messages about what configuration was loaded

## 🎯 Key Benefits

- **Zero Boilerplate**: Absolute minimum code required
- **Automatic Resolution**: ConfigBuilder handles all configuration complexity
- **Perfect for Prototyping**: Get started in seconds
- **Learning Friendly**: Easy to understand what's happening
- **Quick Demos**: Great for showing off your agent quickly

## 🔄 When to Use This Approach

This minimal setup is perfect when:

- You're just getting started with the SDK
- You want to quickly prototype an agent
- You're doing demos or proof-of-concepts  
- You don't need custom FastAPI configuration
- You want the fastest path from agent to server

## ⚡ Even More Minimal

Want it even shorter? You can run directly from the command line:

```bash
# Future CLI feature (coming soon):
# idun run config.yaml --reload
```

## 🔧 Behind the Scenes

When you call `run_server_from_config("config.yaml")`, here's what happens:

1. `ConfigBuilder.resolve_config()` loads and validates the YAML
2. `create_app()` uses the resolved config to create the FastAPI app
3. Agent is initialized once at startup using the lifespan manager
4. Server starts with the configured port and settings

All with automatic error handling and informative logging!

## 🎓 Learning Path

1. **Start Here**: Use this minimal example to get familiar
2. **Add Configuration**: Move to [Example 2](../02_programmatic_config/) for dynamic config  
3. **Full Control**: Try [Example 1](../01_basic_config_file/) for production setups

## 📚 Next Steps

- Modify `minimal_agent.py` to see how your changes affect the server
- Try different configurations in `config.yaml`
- When you need more control, check out the other examples
- Read the [full SDK documentation](../../README_USER_API.md) 