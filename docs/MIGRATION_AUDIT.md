# MkDocs to Mintlify Migration Audit

> Internal planning document. Do not publish.

## Migration map

Each MkDocs page is classified and mapped to its Mintlify destination.

### Legend

| Status | Meaning |
|--------|---------|
| MIGRATE | Move mostly as-is with Mintlify formatting |
| REWRITE | Significant rewrite needed for quality or accuracy |
| MERGE | Content absorbed into another page |
| EXCLUDE | Internal-only or too thin for public docs |
| GENERATE | Replace with OpenAPI-backed or auto-generated docs |

### Page-by-page map

| MkDocs source | Lines | Quality | Status | Mintlify destination | Notes |
|---|---|---|---|---|---|
| `docs/index.md` | 193 | Detailed | REWRITE | `index.mdx` | Rewrite as Mintlify landing with cards, match website tone |
| `docs/getting-started/quickstart.md` | 62 | Adequate | REWRITE | `quickstart.mdx` | Tighten prerequisites, add tabs for CLI/Manager/Manual paths |
| `docs/architecture/overview.md` | 30+ | Detailed | REWRITE | `architecture.mdx` | Merge with concepts/architecture.md, add Mermaid diagram |
| `docs/cli/overview.md` | 109 | Adequate | MIGRATE | `cli/overview.mdx` | Light formatting pass |
| `docs/agent-frameworks/overview.md` | ~30 | Adequate | MERGE | `frameworks/overview.mdx` | Merge into frameworks landing page |
| `docs/agent-frameworks/langgraph.md` | 150+ | Adequate | MIGRATE | `frameworks/langgraph.mdx` | Verify config examples against current schema |
| `docs/agent-frameworks/adk.md` | 150+ | Adequate | MIGRATE | `frameworks/adk.mdx` | Verify config examples against current schema |
| `docs/observability/overview.md` | 45 | Adequate | REWRITE | `observability/overview.mdx` | Rewrite as proper landing with provider cards |
| `docs/observability/langfuse.md` | 106 | Detailed | MIGRATE | `observability/langfuse.mdx` | Good quality, format for Mintlify |
| `docs/observability/arize-phoenix.md` | 86 | Detailed | MIGRATE | `observability/arize-phoenix.mdx` | Good quality, format for Mintlify |
| `docs/observability/langsmith.md` | 84 | Detailed | MIGRATE | `observability/langsmith.mdx` | Good quality, format for Mintlify |
| `docs/observability/gcp-trace.md` | 78 | Detailed | MIGRATE | `observability/gcp-trace.mdx` | Good quality, format for Mintlify |
| `docs/observability/gcp-logging.md` | 74 | Detailed | MIGRATE | `observability/gcp-logging.mdx` | Good quality, format for Mintlify |
| `docs/observability/reference.md` | 49 | Thin | EXCLUDE | — | Skeleton, incomplete |
| `docs/observability/setup-guide.md` | 128 | Adequate | MERGE | `observability/overview.mdx` | Merge key setup steps into overview |
| `docs/memory/index.md` | 93 | Adequate | REWRITE | `memory/overview.mdx` | Consolidate with memory/overview.md |
| `docs/memory/overview.md` | 27 | Adequate | MERGE | `memory/overview.mdx` | Merge into index |
| `docs/memory/memory-langgraph.md` | 122 | Detailed | MIGRATE | `memory/langgraph.mdx` | Good quality |
| `docs/memory/memory-adk.md` | 194 | Detailed | MIGRATE | `memory/adk.mdx` | Good quality |
| `docs/mcp/overview.md` | 61 | Adequate | REWRITE | `tool-governance/overview.mdx` | Rename section, rewrite as governance framing |
| `docs/mcp/docker-mcp.md` | 469 | Detailed | MIGRATE | `tool-governance/docker-toolkit.mdx` | Longest doc, good quality |
| `docs/mcp/mcp-server.md` | 9 | Thin | EXCLUDE | — | "Coming soon" placeholder |
| `docs/a2a/overview.md` | 30 | Adequate | EXCLUDE | — | Feature not ready, "coming soon" |
| `docs/a2a/index.md` | 30 | Adequate | EXCLUDE | — | Duplicate of above |
| `docs/prompts/overview.md` | 226 | Detailed | MIGRATE | `prompts.mdx` | Flatten to single page, good quality |
| `docs/guardrails/overview.md` | 329 | Detailed | REWRITE | `guardrails/overview.mdx` | Split into overview + reference of guard types |
| `docs/integrations/discord.md` | 135 | Detailed | MIGRATE | `integrations/discord.mdx` | Good quality |
| `docs/integrations/slack.md` | 112 | Detailed | MIGRATE | `integrations/slack.mdx` | Good quality |
| `docs/integrations/whatsapp.md` | 93 | Detailed | MIGRATE | `integrations/whatsapp.mdx` | Good quality |
| `docs/sso-rbac/overview.md` | 28 | Adequate | REWRITE | `auth/overview.mdx` | Expand with actual OIDC config from schema/engine CLAUDE.md |
| `docs/deployment/overview.md` | 28 | Adequate | REWRITE | `deployment/overview.mdx` | Rewrite with deployment model cards |
| `docs/deployment/local.md` | 5 | Thin | MERGE | `quickstart.mdx` | Redirect content, already in quickstart |
| `docs/deployment/gcp-self-hosted.md` | 32 | Adequate | MIGRATE | `deployment/gcp.mdx` | Only real deployment guide |
| `docs/deployment/aws-self-hosted.md` | 6 | Thin | EXCLUDE | — | "Coming soon" placeholder |
| `docs/deployment/azure-self-hosted.md` | 6 | Thin | EXCLUDE | — | "Coming soon" placeholder |
| `docs/deployment/k8s-self-hosted.md` | 6 | Thin | EXCLUDE | — | "Coming soon" placeholder |
| `docs/deployment/idun-cloud.md` | 30 | Adequate | EXCLUDE | — | Product not launched, "coming soon" |
| `docs/deployment/concepts.md` | 22 | Adequate | MERGE | `deployment/overview.mdx` | Merge into deployment overview |
| `docs/concepts/overview.md` | 205 | Detailed | MERGE | `architecture.mdx` | Core content merges into architecture |
| `docs/concepts/agent-frameworks.md` | ~30 | Adequate | MERGE | `frameworks/overview.mdx` | Merge into frameworks overview |
| `docs/concepts/architecture.md` | ~30 | Adequate | MERGE | `architecture.mdx` | Merge into architecture |
| `docs/concepts/configuration.md` | ~25 | Adequate | MERGE | `configuration.mdx` | Merge into configuration page |
| `docs/concepts/deployment.md` | ~20 | Adequate | MERGE | `deployment/overview.mdx` | Merge into deployment overview |
| `docs/concepts/engine.md` | ~30 | Adequate | MERGE | `architecture.mdx` | Merge into architecture |
| `docs/concepts/guardrails.md` | ~17 | Adequate | MERGE | `guardrails/overview.mdx` | Merge into guardrails overview |
| `docs/concepts/manager.md` | 31 | Adequate | MERGE | `manager/overview.mdx` | Merge into manager overview |
| `docs/agent-manager/overview.md` | ~30 | Adequate | REWRITE | `manager/overview.mdx` | Expand with actual routes and capabilities |
| `docs/agent-manager/api.md` | ~30 | Thin | GENERATE | `api-reference/` | Replace with OpenAPI-backed reference |
| `docs/agent-manager/authentication.md` | ~30 | Thin | MERGE | `auth/overview.mdx` | Merge into auth section |
| `docs/agent-manager/quickstart.md` | ~30 | Thin | MERGE | `quickstart.mdx` | Merge into main quickstart |
| `docs/guides/basic-configuration.md` | 14 | Thin | MERGE | `configuration.mdx` | Merge into configuration page |
| `docs/guides/cli-setup.md` | 35 | Adequate | MERGE | `cli/overview.mdx` | Merge into CLI overview |
| `docs/reference/configuration.md` | 15 | Thin | MERGE | `configuration.mdx` | Pointer only, merge into config page |
| `docs/reference/rest-api.md` | 13 | Thin | GENERATE | `api-reference/` | Replace with OpenAPI |
| `docs/idun-schema/index.md` | 25 | Thin | EXCLUDE | — | Incomplete, schema is internal |
| `docs/roadmap/roadmap.md` | 5 | Thin | EXCLUDE | — | Links to repo, not docs content |
| `docs/more/faq.md` | 15 | Thin | REWRITE | `faq.mdx` | Expand with real questions from support |
| `docs/FEATURES_REVIEW.md` | 540 | Detailed | EXCLUDE | — | Internal review document |
| `docs/TECHNICAL_WHITEPAPER.md` | 790 | Detailed | EXCLUDE | — | Internal whitepaper |

### Summary

| Status | Count | Notes |
|--------|-------|-------|
| MIGRATE | 12 | Good quality, formatting pass only |
| REWRITE | 9 | Significant content improvement needed |
| MERGE | 17 | Content absorbed into better-structured pages |
| EXCLUDE | 10 | Thin placeholders, internal docs, or unready features |
| GENERATE | 2 | OpenAPI-backed API reference |
| **Total** | **50** | |

### Final page count estimate

The 50 MkDocs files consolidate to approximately **25 Mintlify pages** plus auto-generated API reference pages.

## Factual gaps and mismatches

### Website claims vs. actual product

| Claim (website) | Status | Evidence |
|---|---|---|
| "15+ ready-to-use guardrails" | Verified | Schema enum has 15 types (BAN_LIST through CUSTOM_LLM) |
| "LangGraph, ADK, Haystack supported" | Partially true | Haystack adapter exists but is experimental, no streaming |
| "AG-UI and CopilotKit-compatible" | Verified | Engine has `/agent/run` SSE endpoint + CopilotKit router |
| "n8n agent" support claimed in landing | Unverified | Framework enum has no N8N entry in schema; website lists it |
| "Okta, Auth0, SAML, OIDC" | Partially true | OIDC generic + Google OIDC verified. SAML not in code. Okta/Auth0 work via OIDC. |
| "Audit logs" | Unverified | No audit log model or endpoint found in manager |
| "Role-based access" | Verified | MembershipModel has role field (owner/admin/member/viewer) |
| "A2A protocol support" | Not ready | Feature marked "coming soon" in docs |
| "Memory: In-Memory, SQLite, PostgreSQL" | Verified | LangGraph checkpointer configs in schema |

### Documentation claims vs. code

| Claim (docs) | Status | Notes |
|---|---|---|
| "Terraform modules for GCP" | Unverified | Referenced but no Terraform files in repo |
| "10-15 minutes to complete" quickstart | Plausible | Depends on Docker pull speed |
| "/reload endpoint" | Security concern | Not SSO-protected per engine CLAUDE.md |
| "CrewAI" framework support | In schema only | Enum value exists but no adapter implementation found |

## IA decisions

1. **Renamed MCP section to "Tool governance"** — avoids reserved `/mcp` path, better frames the feature
2. **Merged 8 concepts pages into their parent sections** — eliminates thin standalone pages
3. **Excluded all "coming soon" placeholders** — no empty pages in production docs
4. **Excluded internal docs** (FEATURES_REVIEW.md, TECHNICAL_WHITEPAPER.md) — planning artifacts
5. **Single configuration page** instead of scattered config references
6. **Auth section** combines SSO/RBAC and manager authentication into one coherent section
7. **API reference as separate tab** with OpenAPI-generated pages from manager spec
