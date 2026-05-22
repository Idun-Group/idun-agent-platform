# Observability with Langfuse (LangGraph)

LangGraph chatbot that streams every run as traces to a [Langfuse](https://langfuse.com) workspace. The agent code is unchanged from a baseline chat agent. The `observability:` block in `config.yaml` is what makes traces flow.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (https://cloud.langfuse.com)
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Send a message at `http://localhost:8000`. In Langfuse, the run appears under the project's traces view tagged with `run_name: observability-langgraph`.

## How it works

At boot, the engine reads the `observability:` list and instantiates a callback handler per enabled provider. For Langfuse, the LangChain `CallbackHandler` is added to every `RunnableConfig` the LangGraph adapter passes to `ainvoke` / `astream`, so each LLM call, tool call, and graph step emits a span.

The startup log shows `✅ Langfuse client is authenticated and ready!` when credentials resolve.

Source: [`libs/idun_agent_engine/src/idun_agent_engine/observability/langfuse/langfuse_handler.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_engine/src/idun_agent_engine/observability/langfuse/langfuse_handler.py).

See the [Langfuse provider docs](https://docs.idun-group.com/observability/langfuse) for the full config schema and alternative providers (Phoenix, LangSmith, GCP).
