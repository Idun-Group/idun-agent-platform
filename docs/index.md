---
title: Idun Agent Platform
---

# Idun Agent Platform

Build, deploy, and operate AI agents with a unified API, production-grade runtime, and first-class docs.

Use these docs to get started quickly, understand the architecture, and explore the Python Engine API.

## Quick links

- Getting Started: see [Getting Started](getting-started.md)
- Architecture overview: see [Architecture](architecture.md)
- Examples: see [Examples](examples.md)
- API reference: see [API Reference](reference/index.md)

## What is Idun?

Idun is a modular platform composed of:

- Idun Agent Engine: Python library that wraps agent frameworks behind a FastAPI server with unified endpoints and observability.
- Idun Agent Manager: Service that packages agent code, builds images, and deploys them to Docker, Cloud Run, or Kubernetes.
- Idun Agent Gateway: HTTP gateway that routes requests to agent instances by Agent ID.
- Idun Agent UI: Next.js application to manage and interact with agents.

See the repo `README.md` for a high-level overview and roadmap.
