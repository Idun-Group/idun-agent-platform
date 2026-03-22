# Deployment Concepts

This page explains the main deployment trade-offs and how they relate to Idun’s architecture.

**Time to read:** ~5 minutes.

## Standalone vs managed mode

- **Standalone Engine**: fastest for local dev and simple deployments; config comes from a local YAML file.
- **Managed mode**: Engines pull signed configuration from the Agent Manager; enables centralized governance (SSO/RBAC, tenancy, approved observability/guardrails/MCP).

## Environment topologies

- **Local**: Docker Compose for quick iteration.
- **Self-hosted**: run Manager/UI/Engines in your own cloud/on-prem for data sovereignty.
- **Hybrid**: Engines close to data; Manager/UI centralized.

## Next steps

- [Deployment overview](overview.md)
- [Local deployment](local.md)
- [Architecture overview](../architecture/overview.md)
