# Configuration Concepts

Idun is **configuration-driven**: you describe your agent runtime, observability, guardrails, memory, and MCP servers declaratively (typically in YAML), and the platform makes it runnable and governable.

**Time to read:** ~5 minutes.

## What you configure

- **Agent framework + code entrypoint** (LangGraph, ADK, Haystack, templates)
- **Server settings** (ports, API surface)
- **Observability** (Langfuse, Phoenix, LangSmith, GCP)
- **Guardrails** (safety policies, validation)
- **Memory / checkpointing** (SQLite/PostgreSQL, session services)
- **MCP servers** (tooling via Model Context Protocol)

## Where configuration lives

- **Standalone Engine**: local YAML config (fastest path for local development).
- **Managed mode**: configuration and access policies are stored in the **Agent Manager** and pulled by Engines at runtime.

## Next steps

- [Architecture overview](../architecture/overview.md)
- [Getting started](../getting-started/quickstart.md)
