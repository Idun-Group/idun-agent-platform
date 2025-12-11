# Agent Frameworks

Idun Agent Platform allows you to bring your own agents built with popular **agent frameworks** and run them as **production-grade services** with observability, memory, and guardrails.

Today, Idun supports:

- ![LangGraph logo](../images/logo/langgraph-color.png){ width="90" }
  **LangGraph** — graph-based agents with built-in checkpointing and stateful workflows.
  Learn more in the [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/quickstart).

- ![ADK logo](../images/logo/agent-development-kit.png){ width="90" }
  **ADK (Agent Development Kit)** — Google’s framework for building Gemini-powered agents.
  Learn more in the [ADK documentation](https://google.github.io/adk-docs/).

If you need support for another framework, reach out via Discord or GitHub Issues.

## How frameworks integrate with Idun

Under the hood, each framework is integrated via a dedicated **Engine adapter** that implements a common `BaseAgent` protocol. This gives you:

- **Unified API**: your clients talk to the same HTTP API regardless of the underlying framework.
- **Shared features**: observability, guardrails, MCP, and memory work the same way across frameworks.
- **Consistent deployment**: you can run all agents through the Idun Agent Engine, either standalone or managed by the Agent Manager.

To get started with a specific framework, follow one of the guides below:

- [ADK agents with Idun](adk.md)
- [LangGraph agents with Idun](langgraph.md)

For a broader architecture view, see the [Architecture Overview](../architecture/overview.md) and [Concepts → Agent Frameworks](../concepts/agent-frameworks.md) (when available).
