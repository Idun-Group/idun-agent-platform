# SmolAgent Implementation Guide

This guide explains how to use the `smolagents` implementation in the Idun Agent Manager.

## Overview

The `SmolAgent` implementation wraps the `CodeAgent` from Hugging Face's `smolagents` library, providing a powerful, code-centric agent that integrates seamlessly with the Idun Agent Manager. It translates the synchronous, code-based event stream from `smolagents` into the asynchronous, UI-compatible event stream used by the manager.

## Features

- ✅ **Code-First Agents**: Leverages agents that think and act in Python code.
- ✅ **Streaming Support**: Translates `smolagents`'s synchronous generator into a fully asynchronous stream of `ag-ui` events.
- ✅ **Flexible Model Backends**: Supports various model providers through `smolagents`, including Hugging Face Inference, LiteLLM, OpenAI, and more.
- ✅ **Built-in Tools**: Easily configure pre-built tools like `WebSearchTool`.

## Quick Start

### 1. Install Dependencies

```bash
pip install smolagents
pip install tavily-python  # For WebSearchTool
```

### 2. Set Environment Variables
The `WebSearchTool` (and many other tools) requires an API key.

```bash
export TAVILY_API_KEY="your-tavily-api-key"
```
You may also need a Hugging Face token for certain models.
```bash
export HF_TOKEN="your-hugging-face-token"
```

### 3. Create a SmolAgent Configuration

Define your agent in a Python dictionary. This includes the model and tools you want to use.

```python
# Example configuration for a SmolAgent
agent_config = {
    "name": "WebSearchAgent",
    "model_config": {
        "type": "InferenceClientModel",
        "model_id": "HuggingFaceH4/zephyr-7b-beta",
    },
    "tools_config": [
        "WebSearchTool"
    ]
}
```

### 4. Initialize and Use the Agent

```python
from idun_agent_manager.core.agents.smol_agent_impl import SmolAgent

# Create the agent
agent = SmolAgent()

# Initialize with configuration
await agent.initialize(agent_config)

# Process a message via streaming
message = {
    "query": "What are the latest developments in AI agents?",
    "session_id": "user456"
}

async for event in agent.process_message_stream(message):
    print(f"Event: {event.type}")
    if hasattr(event, 'delta'):
        print(f"Content: {event.delta}")
```

## Configuration Options

The configuration is split into two main sections: `model_config` and `tools_config`.

### `model_config`
Specify the model backend and its parameters. The `type` key determines which `smolagents` model class to use.

**Hugging Face (Free Tier):**
```python
"model_config": {
    "type": "InferenceClientModel",
    "model_id": "HuggingFaceH4/zephyr-7b-beta"
}
```

**LiteLLM (e.g., with local Ollama):**
```python
"model_config": {
    "type": "LiteLLMModel",
    "model_id": "ollama/llama3",
    "api_base": "http://localhost:11434"
}
```

**OpenAI:**
```python
"model_config": {
    "type": "OpenAIServerModel",
    "model_id": "gpt-4o",
    "api_key": "your-openai-key"
}
```

Supported types: `InferenceClientModel`, `LiteLLMModel`, `OpenAIServerModel`, `AzureOpenAIServerModel`, `AmazonBedrockServerModel`, `TransformersModel`.

### `tools_config`
A list of strings specifying which pre-built tools to load.

```python
"tools_config": [
    "WebSearchTool"
    # Add other tool names here
]
```
Currently, only `WebSearchTool` is mapped. To add more, extend the `initialize` method in `smol_agent_impl.py`.

## Event Mapping

The `SmolAgent` implementation maps `smolagents` event types to `ag-ui` events as follows:

| `smolagents` type | `ag-ui` Event(s) | Description |
|---|---|---|
| `thought` | `ThinkingStart` / `ThinkingEnd` | Captures the agent's reasoning steps. |
| `tool_code` | `ToolCallStart` / `ToolCallArgs` | The Python code the agent is about to execute. |
| `tool_output` | `ToolCallEnd` / `TextMessageContent` | The result from the code execution. |
| `answer` | `TextMessageContent` | The final, user-facing answer. |

## Session Management

`smolagents` handles memory and state internally for the duration of a single `.run()` call. This implementation does not persist state across multiple `process_message` or `process_message_stream` calls. Each query starts a new, independent run.

## Testing

To verify your setup and the agent's functionality, run the dedicated test script. Make sure you have the required environment variables set.

```bash
cd tests
python test_smol_agent_creation.py
```

The test suite covers:
- Agent initialization with a Hugging Face model.
- A full streaming run using the `WebSearchTool`.

## Troubleshooting

- **ImportError**: Ensure `smolagents` is installed (`pip install smolagents`).
- **API Key Errors**: Make sure the necessary environment variables (e.g., `TAVILY_API_KEY`, `HF_TOKEN`, `OPENAI_API_KEY`) are set correctly in your environment.
- **Model Not Found**: Double-check the `model_id` and ensure you have access to it. For local models like Ollama, ensure the service is running.
- **Permissions**: If using a gated model from Hugging Face, ensure your `HF_TOKEN` has the required permissions.

## Additional Resources

- [Official `smolagents` Repository](https://github.com/huggingface/smolagents)
- [Official `smolagents` Documentation](https://huggingface.co/docs/smolagents/en/index)
