# Idun Agent Engine - User Guide

The Idun Agent Engine provides a simple, powerful way to turn your conversational AI agents into production-ready web services. With just a few lines of code, you can expose your LangGraph, CrewAI, or custom agents through a FastAPI server with built-in features like streaming, persistence, and monitoring.

## 🚀 Quick Start

### Installation
```bash
pip install idun-agent-engine
```

### Basic Usage

```python
from idun_agent_engine import create_app, run_server

# Create your FastAPI app with your agent
app = create_app(config_path="config.yaml")

# Run the server
run_server(app, port=8000)
```

That's it! Your agent is now running at `http://localhost:8000` with full API documentation at `http://localhost:8000/docs`.

## 📋 Configuration

### Option 1: YAML Configuration File

Create a `config.yaml` file:

```yaml
engine:
  api:
    port: 8000
  telemetry:
    provider: "langfuse"

agent:
  type: "langgraph"
  config:
    name: "My Awesome Agent"
    graph_definition: "my_agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///agent.db"
```

### Option 2: Programmatic Configuration

```python
from idun_agent_engine import ConfigBuilder, create_app, run_server

config = (ConfigBuilder()
          .with_api_port(8080)
          .with_langgraph_agent(
              name="My Agent",
              graph_definition="my_agent.py:graph",
              sqlite_checkpointer="agent.db")
          .build())

app = create_app(config_dict=config)
run_server(app)
```

## 🤖 Supported Agent Types

### LangGraph Agents

```python
# Your LangGraph agent file (my_agent.py)
from langgraph.graph import StateGraph, END
from typing import TypedDict

class AgentState(TypedDict):
    messages: list

def my_node(state):
    # Your agent logic here
    return {"messages": [("ai", "Hello from LangGraph!")]}

graph = StateGraph(AgentState)
graph.add_node("agent", my_node)
graph.set_entry_point("agent")
graph.add_edge("agent", END)
```

### Future Agent Types
- CrewAI agents (coming soon)
- AutoGen agents (coming soon)
- Custom agent implementations

## 🌐 API Endpoints

Once your server is running, you get these endpoints automatically:

### POST `/agent/invoke`
Send a single message and get a complete response:

```bash
curl -X POST "http://localhost:8000/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Hello, how are you?",
    "session_id": "user-123"
  }'
```

### POST `/agent/stream`
Stream responses in real-time:

```bash
curl -X POST "http://localhost:8000/agent/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tell me a story",
    "session_id": "user-123"
  }'
```

### GET `/health`
Health check for monitoring:

```bash
curl "http://localhost:8000/health"
```

## 🔧 Advanced Usage

### Development Mode
```python
# Enable auto-reload for development
run_server(app, reload=True)
```

### Production Deployment
```python
# Run with multiple workers for production
run_server(app, workers=4, host="0.0.0.0", port=8000)
```

### One-Line Server
```python
from idun_agent_engine.core.server_runner import run_server_from_config

# Create and run server in one call
run_server_from_config("config.yaml", port=8080, reload=True)
```

### Custom FastAPI Configuration
```python
from idun_agent_engine import create_app
from fastapi.middleware.cors import CORSMiddleware

app = create_app("config.yaml")

# Add custom middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add custom routes
@app.get("/custom")
def custom_endpoint():
    return {"message": "Custom endpoint"}
```

## 🛠️ Configuration Reference

### Engine Configuration
```yaml
engine:
  api:
    port: 8000                    # Server port
  telemetry:
    provider: "langfuse"          # Telemetry provider
```

### LangGraph Agent Configuration
```yaml
agent:
  type: "langgraph"
  config:
    name: "Agent Name"            # Human-readable name
    graph_definition: "path.py:graph"  # Path to your graph
    checkpointer:                 # Optional persistence
      type: "sqlite"
      db_url: "sqlite:///agent.db"
    store:                        # Optional store (future)
      type: "memory"
```

## 📚 Examples

Check out the `examples/` directory for complete working examples:

- **Basic LangGraph Agent**: Simple question-answering agent
- **ConfigBuilder Usage**: Programmatic configuration
- **Custom Middleware**: Adding authentication and CORS
- **Production Setup**: Multi-worker deployment configuration

## 🔍 Validation and Debugging

```python
from idun_agent_engine.utils.validation import validate_config_dict, diagnose_setup

# Validate your configuration
config = {...}
errors = validate_config_dict(config)
if errors:
    print("Configuration errors:", errors)

# Diagnose your setup
diagnosis = diagnose_setup()
print("System diagnosis:", diagnosis)
```

## 🚀 Deployment

### Docker
```dockerfile
FROM python:3.11-slim

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "-m", "idun_agent_engine", "run", "config.yaml"]
```

### Cloud Platforms
- Heroku: `Procfile` with `web: python main.py`
- Railway: Deploy with one click
- AWS Lambda: Use with Mangum adapter
- Google Cloud Run: Deploy Docker container

## 🤝 Contributing

The Idun Agent Engine is designed to be extensible. To add support for new agent frameworks:

1. Implement the `BaseAgent` interface
2. Add configuration models for your agent type
3. Register your agent in the factory
4. Submit a pull request!

## 📖 Documentation

- [Full API Documentation](https://docs.idun-agent-engine.com)
- [Agent Framework Guide](https://docs.idun-agent-engine.com/frameworks)
- [Deployment Guide](https://docs.idun-agent-engine.com/deployment)
- [Contributing Guide](https://docs.idun-agent-engine.com/contributing)

## 📄 License

MIT License - see LICENSE file for details. 