# Observability with Langfuse (Google ADK)

ADK chatbot that streams every run as traces to a [Langfuse](https://langfuse.com) workspace. Same `observability:` block as the [LangGraph variant](../langgraph/README.md); only `agent.type` and the agent code differ.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (https://cloud.langfuse.com)
pip install idun-agent-engine google-adk
idun init
```

Send a message at `http://localhost:8000`. In Langfuse, the run appears under the project's traces view tagged with `run_name: observability-adk`.

## How it works

When the ADK adapter sees Langfuse in the `observability:` list, it installs `GoogleADKInstrumentor` from `openinference.instrumentation.google_adk` automatically. OTel spans flow from ADK's runner into Langfuse via the OpenInference layer, no extra wiring needed in your agent code.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py) (search for `GoogleADKInstrumentor`).

See the [Langfuse provider docs](https://docs.idun-group.com/observability/langfuse) for the full config schema.
