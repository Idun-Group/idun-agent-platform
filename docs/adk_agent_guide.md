# ADK Agent Implementation Guide

This guide explains how to use the Google Agent Development Kit (ADK) implementation in the Idun Agent Manager.

## Overview

The ADK agent implementation provides a streaming-enabled interface for Google's Agent Development Kit, similar to the LangGraph implementation. It converts ADK events into ag-ui compatible events for seamless integration with the existing infrastructure.

## Features

- ✅ **Streaming Support**: Real-time event streaming with ag-ui event types
- ✅ **Tool Integration**: Support for custom tools and ADK built-in tools
- ✅ **Session Management**: Memory and state management across conversations
- ✅ **Event Conversion**: Automatic conversion from ADK events to ag-ui events
- ✅ **Error Handling**: Robust error handling and cleanup
- ✅ **Configuration**: Flexible configuration options

## Quick Start

### 1. Install Dependencies

```bash
pip install google-adk
```

### 2. Create an ADK Agent Configuration

```python
# Example configuration for an ADK agent
agent_config = {
    "name": "WeatherAgent",
    "model": "gemini-2.0-flash",
    "description": "An agent that provides weather information",
    "instruction": "You are a helpful weather assistant...",
    "tools": [get_weather_function]  # List of tool functions
}
```

### 3. Initialize and Use the Agent

```python
from idun_agent_manager.core.agents.adk_agent_impl import ADKAgent

# Create the agent
agent = ADKAgent()

# Initialize with configuration
await agent.initialize(agent_config)

# Process a message
message = {
    "query": "What's the weather like in Paris?",
    "session_id": "user123"
}

response = await agent.process_message(message)
print(response)
```

### 4. Streaming Messages

```python
# Stream events for real-time responses
async for event in agent.process_message_stream(message):
    print(f"Event: {event.type}")
    if hasattr(event, 'delta'):
        print(f"Content: {event.delta}")
```

## Configuration Options

### Basic Configuration

```python
{
    "name": "AgentName",           # Required: Agent identifier
    "model": "gemini-2.0-flash",   # Required: Model to use
    "description": "...",          # Agent description
    "instruction": "...",          # System prompt/instructions
    "tools": [...]                 # List of tool functions
}
```

### Tool Configuration

Tools can be provided as:

1. **Function objects** (recommended for simple tools):
```python
def get_weather(location: str) -> str:
    """Get weather for a location."""
    return f"Weather in {location}: Sunny, 22°C"

config = {
    "tools": [get_weather]
}
```

2. **Module paths** (for complex tools):
```python
config = {
    "tools": ["path/to/tools.py:weather_tool"]
}
```

## Event Types

The ADK implementation converts ADK events to the following ag-ui event types:

- `RUN_STARTED` - When agent processing begins
- `RUN_FINISHED` - When agent processing completes
- `TEXT_MESSAGE_START` - Start of text message
- `TEXT_MESSAGE_CONTENT` - Text content chunk
- `TEXT_MESSAGE_END` - End of text message
- `TOOL_CALL_START` - Tool execution begins
- `TOOL_CALL_ARGS` - Tool arguments
- `TOOL_CALL_END` - Tool execution completes
- `THINKING_START` - Agent reasoning begins
- `THINKING_END` - Agent reasoning completes
- `STEP_STARTED` - Processing step begins
- `STEP_FINISHED` - Processing step completes

## Example: Weather Agent

Here's a complete example of a weather agent:

```python
# tools.py
def get_weather(location: str) -> str:
    """
    Get the current weather for a location.
    
    Args:
        location: The city or location to get weather for
        
    Returns:
        A weather description string
    """
    weather_data = {
        "paris": "Sunny, 22°C",
        "london": "Cloudy, 15°C", 
        "new york": "Rainy, 18°C",
        "tokyo": "Clear, 25°C",
    }
    
    location_lower = location.lower()
    if location_lower in weather_data:
        return f"Weather in {location}: {weather_data[location_lower]}"
    else:
        return f"Weather data not available for {location}"

# agent_config.py
WEATHER_AGENT_CONFIG = {
    "name": "WeatherAgent",
    "model": "gemini-2.0-flash",
    "description": "Provides weather information for cities",
    "instruction": """You are a helpful weather assistant. 
    When users ask about weather, use the get_weather tool to provide accurate information.
    Be friendly and conversational in your responses.""",
    "tools": [get_weather]
}

# main.py
import asyncio
from idun_agent_manager.core.agents.adk_agent_impl import ADKAgent

async def main():
    # Create and initialize agent
    agent = ADKAgent()
    await agent.initialize(WEATHER_AGENT_CONFIG)
    
    # Test the agent
    message = {
        "query": "What's the weather like in Tokyo?",
        "session_id": "demo_session"
    }
    
    # Get response
    response = await agent.process_message(message)
    print(f"Response: {response}")
    
    # Stream events
    print("\nStreaming events:")
    async for event in agent.process_message_stream(message):
        print(f"📡 {event.type}")

if __name__ == "__main__":
    asyncio.run(main())
```

## ADK vs LangGraph

| Feature | ADK Agent | LangGraph Agent |
|---------|-----------|-----------------|
| **Event System** | ADK Events → ag-ui events | LangGraph Events → ag-ui events |
| **Tool Support** | Python functions + ADK tools | Python functions + LangGraph tools |
| **Session Management** | ADK Session Service | LangGraph Checkpointer |
| **Streaming** | ✅ Full support | ✅ Full support |
| **State Management** | ADK built-in | LangGraph StateGraph |
| **Model Support** | Gemini (primary), others via LiteLLM | Any model supported by LangGraph |

## Session Management

### Creating Sessions

```python
# Get or create a session
session = agent.get_session("user123")

# Access session memory
memory = agent.get_memory("user123")
```

### Session State

Sessions automatically maintain conversation history and state across messages when using the same `session_id`.

## Error Handling

The implementation includes comprehensive error handling:

```python
try:
    response = await agent.process_message(message)
except RuntimeError as e:
    print(f"Agent error: {e}")
except ValueError as e:
    print(f"Configuration error: {e}")
```

## Best Practices

1. **Tool Documentation**: Provide clear docstrings for all tools
2. **Error Handling**: Always wrap agent calls in try-catch blocks
3. **Session IDs**: Use consistent session IDs for conversation continuity
4. **Resource Cleanup**: Ensure proper cleanup in production environments
5. **Configuration Validation**: Validate configuration before initialization

## Testing

Run the ADK agent tests:

```bash
cd tests
python test_adk_agent_creation.py
```

The test suite includes:
- Basic agent creation and initialization
- Message processing
- Streaming functionality
- Tool execution
- Session management

## Troubleshooting

### Common Issues

1. **ImportError**: Make sure `google-adk` is installed
   ```bash
   pip install google-adk
   ```

2. **Authentication**: Set up Google Cloud credentials
   ```bash
   gcloud auth application-default login
   ```

3. **Model Access**: Ensure you have access to the specified Gemini model

4. **Tool Errors**: Verify tool functions have proper type hints and docstrings

### Debug Mode

Enable verbose logging to see detailed event flow:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Additional Resources

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [ADK Events Guide](https://google.github.io/adk-docs/events/)
- [ADK Runtime Documentation](https://google.github.io/adk-docs/runtime/)
- [Example ADK Agents](../tests/example_agents_adk/)

## Contributing

To contribute to the ADK implementation:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update this documentation
4. Ensure compatibility with ag-ui events

## Support

For issues specific to the ADK implementation, check:
1. This documentation
2. The test files for examples
3. Google ADK documentation for ADK-specific questions 