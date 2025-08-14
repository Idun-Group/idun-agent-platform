"""
Simple SmolAgent Example

This file defines a sample configuration for a smolagents CodeAgent.
It uses a model from the Hugging Face Hub and the WebSearchTool.

NOTE: The WebSearchTool requires the TAVILY_API_KEY environment variable to be set.
"""

# This configuration uses a model hosted on the Hugging Face free inference endpoints.
AGENT_CONFIG = {
    "name": "SimpleSmolAgent",
    "model_config": {
        "type": "InferenceClientModel",
        "model_id": "HuggingFaceH4/zephyr-7b-beta",
        # You might need to pass your HF token if the model is gated or you hit rate limits
        # "token": os.environ.get("HF_TOKEN")
    },
    "tools_config": ["WebSearchTool"],
}

# Alternate configuration using LiteLLM with a local Ollama model
# This is useful for local testing without requiring API keys.
# Make sure Ollama is running and has the 'llama3' model.
# ollama run llama3
AGENT_CONFIG_OLLAMA = {
    "name": "SimpleSmolAgentOllama",
    "model_config": {
        "type": "LiteLLMModel",
        "model_id": "ollama/llama3",
        "api_base": "http://localhost:11434",
    },
    "tools_config": ["WebSearchTool"],
}
