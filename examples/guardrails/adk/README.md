# Guardrails (Google ADK)

ADK chatbot with two guardrails wired in `config.yaml`. Same guard set as the [LangGraph variant](../langgraph/README.md); only `agent.type` and the agent code differ.

- **Input**: `detect_pii` (email, phone, credit card). Triggers a custom `reject_message`.
- **Output**: `toxic_language` (threshold `0.7`). Triggers a custom `reject_message`.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill GUARDRAILS_API_KEY (https://hub.guardrailsai.com)
pip install idun-agent-engine google-adk
idun init
```

Open `http://localhost:8000` and try a message that includes PII to see the input guard fire and return the configured `reject_message`.

## How it works

Identical to the LangGraph variant: guardrails are configured at the engine layer, not the agent layer. The ADK agent code never references them. The engine installs each guard from the Guardrails AI hub at boot and wraps the agent's input and output handlers. On a failure, the response body contains the `reject_message` you set in `config.yaml`.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/guardrails_v2.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/guardrails_v2.py).
