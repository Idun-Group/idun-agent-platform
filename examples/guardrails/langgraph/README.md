# Guardrails (LangGraph)

LangGraph chatbot with two guardrails wired in `config.yaml`:

- **Input**: `detect_pii` blocks user messages that contain email addresses, phone numbers, or credit card numbers. Triggers a custom `reject_message`.
- **Output**: `toxic_language` blocks assistant responses scoring above a toxicity threshold of `0.7`. Triggers a custom `reject_message`.

The agent code itself is untouched. Guardrails are entirely declarative.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill GUARDRAILS_API_KEY (https://hub.guardrailsai.com)
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Open `http://localhost:8000`. Trigger the input guard with a message containing PII:

```
my email is jane@example.com, what can I do here?
```

You will see the configured `reject_message` instead of the model response.

## How it works

The engine parses the `guardrails:` block at boot, downloads each guard from the Guardrails AI hub (using `GUARDRAILS_API_KEY`), and wraps the agent's input and output handlers. A failing guard short-circuits the request with a `guardrail` field naming which guard triggered, and the response body contains the `reject_message` from `config.yaml`.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/guardrails_v2.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/guardrails_v2.py).

See the [guardrails reference](https://docs.idun-group.com/guardrails/reference) for the full list of 15 guards.
