# AGUI/CopilotKit Integration Example

This example demonstrates how to use the Idun Agent Engine with CopilotKit's AGUI features to expose your LangGraph agent through the `/agui/` endpoint.

## Overview

The Idun Agent Engine now supports CopilotKit integration, which automatically exposes your LangGraph agent through a CopilotKit-compatible endpoint at `/agui/`. This allows you to use CopilotKit's frontend components with your agent.

## What's Included

- **Automatic AGUI Endpoint**: When you use a LangGraph agent, the engine automatically sets up a `/agui/` endpoint
- **CopilotKit Compatible**: The endpoint follows CopilotKit's protocol for seamless integration
- **Multi-Agent Support**: Each agent gets its own AGUI endpoint with proper naming and description

## How It Works

1. The Idun Agent Engine detects when you're using a LangGraph agent
2. During startup, it automatically configures the CopilotKit integration
3. Your agent becomes available at `/agui/` with full CopilotKit support

## Configuration

Use the standard Idun Agent Engine configuration. The AGUI endpoint is automatically configured:

```yaml
# config.yaml
server:
  api:
    port: 8000

agent:
  type: "langgraph"
  config:
    name: "My AGUI Agent"
    graph_definition: "./agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///checkpoint.db"
```

## Running the Example

1. **Install Dependencies**:
```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/libs/idun_agent_engine
uv pip install -e .
```

2. **Run the Server**:
```bash
python examples/05_agui_copilotkit/main.py
```

3. **Test the AGUI Endpoint**:

The AGUI endpoint will be available at:
- Main endpoint: `http://localhost:8000/agui/`
- Health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`

## Using with CopilotKit Frontend

To use this endpoint with CopilotKit's React components:

```typescript
import { CopilotKit } from "@copilotkit/react-core";

function App() {
  return (
    <CopilotKit runtimeUrl="http://localhost:8000/agui">
      {/* Your app components */}
    </CopilotKit>
  );
}
```

## API Endpoints

### AGUI Endpoint
- **URL**: `/agui/`
- **Purpose**: CopilotKit-compatible agent endpoint
- **Protocol**: Follows CopilotKit's AGUI protocol

### Standard Endpoints (still available)
- **URL**: `/agent/invoke` - Invoke agent without streaming
- **URL**: `/agent/stream` - Stream agent responses
- **URL**: `/health` - Health check

## Environment Variables

You may need to set up environment variables for observability:

```bash
# .env
LANGFUSE_HOST=https://your-langfuse-host.com
LANGFUSE_PUBLIC_KEY=your_public_key
LANGFUSE_SECRET_KEY=your_secret_key

# Or for Phoenix
PHOENIX_API_KEY=your_api_key
PHOENIX_COLLECTOR_ENDPOINT=https://your-phoenix-endpoint.com
```

## Troubleshooting

### AGUI endpoint not available
- Ensure you're using a LangGraph agent (not Haystack or other types)
- Check the console output for "✅ AGUI endpoint configured" message
- If you see a warning about AGUI setup failure, check the error details

### CopilotKit connection issues
- Verify the server is running and accessible
- Check CORS settings if accessing from a different origin
- Ensure the runtimeUrl in your frontend matches your server URL

## Next Steps

- Explore CopilotKit's documentation for frontend integration
- Customize your agent's behavior for better AGUI interactions
- Add custom tools and actions to your LangGraph agent

## Learn More

- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Idun Agent Engine Documentation](../../README.md)
