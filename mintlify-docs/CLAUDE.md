# CLAUDE.md — Idun Platform Documentation

This file governs all documentation work in `/mintlify-docs`.

## Working relationship

You are writing public-facing technical documentation for an open-source AI agent deployment platform. Every page will be read by developers evaluating the product, platform engineers adopting it, and AI systems indexing it for retrieval.

## Source-of-truth order

When facts conflict, trust in this order:

1. **Code** — schema enums, route definitions, config models, test fixtures
2. **Service-level CLAUDE.md files** — `libs/idun_agent_engine/CLAUDE.md`, `libs/idun_agent_schema/CLAUDE.md`, `services/idun_agent_manager/CLAUDE.md`, `services/idun_agent_web/CLAUDE.md`
3. **Root CLAUDE.md** — `/CLAUDE.md`
4. **README.md** — repo root and service READMEs
5. **Existing MkDocs pages** — `/docs/` (reference only, may be stale)
6. **Landing page** — `landing-page-idun-platform` repo (marketing, may overstate)

Never invent capabilities. If you cannot verify a feature exists in code, do not document it. Mark unverified claims with `<!-- VERIFY: description -->` comments.

## Writing standards

### Voice and tone
- Second person ("you"), active voice, present tense
- Direct and technical. Write for a senior developer who has 5 minutes
- No filler: "simply", "just", "easily", "seamlessly", "robust", "powerful", "comprehensive", "cutting-edge"
- No em dashes. Use commas, periods, or parentheses
- No emoji unless in UI screenshot context
- Sentence case for all headings ("Getting started", not "Getting Started")

### Structure
- Lead with what the reader can do, not what the product is
- Code examples before explanations where possible
- One idea per paragraph. Short paragraphs (2-4 sentences max)
- Every page must be useful standalone. No "see other page for details" without a direct link

### Code blocks
- Always include language tag
- Use realistic values, not `your-api-key-here` or `xxx`
- Show the minimal working example first, then variations
- Prefer YAML for engine config examples, curl for API examples, Python for SDK examples

## Frontmatter requirements

Every `.mdx` page must have:

```yaml
---
title: "Descriptive title"
description: "One sentence summary for SEO and AI retrieval. Include key terms naturally."
keywords: ["relevant", "search", "terms"]
---
```

Optional but encouraged:
- `sidebarTitle` when the full title is too long for navigation
- `icon` for section landing pages

## Forbidden content

- Internal planning documents, implementation plans, review notes
- "Coming soon" placeholders for unbuilt features
- Marketing language or unverified capability claims
- Pricing information (lives on idunplatform.com)
- Security vulnerabilities or exploit details
- API keys, secrets, or credentials (even example ones that look real)
- Content at the `/mcp` path (reserved by Mintlify for hosted MCP)

## Verification rules

Before publishing any factual claim:

1. **Framework support** — verify adapter exists in `libs/idun_agent_engine/src/idun_agent_engine/agent/`
2. **Config options** — verify field exists in `libs/idun_agent_schema/src/idun_agent_schema/engine/`
3. **API endpoints** — verify route exists in `services/idun_agent_manager/src/app/api/v1/routers/`
4. **Guardrail types** — verify enum value in schema `guardrails.py`
5. **Environment variables** — verify in manager `Settings` class or engine config resolution
6. **Integration claims** — verify integration code exists, not just a schema entry

## Style alignment with idunplatform.com

### Colors (from landing page CSS variables)
| Token | Hex | Usage |
|-------|-----|-------|
| `idun-purple` | `#8C52FF` | Primary brand, accent, links |
| `idun-green` | `#0ED4A5` | Success, auth features |
| `idun-red` | `#FF2970` | Guardrails, alerts |
| `idun-yellow` | `#FFDC68` | Memory, observability |
| `idun-dark` | `#040210` | Dark backgrounds |
| `idun-card` | `#121122` | Card surfaces |

### Typography
- Body: Figtree (weights 400-800)
- Headings: Space Grotesk (weights 500-700)

### Product name
- Full: "Idun Agent Platform" or "Idun Platform"
- Short: "Idun" (only after first full mention on a page)
- Never: "IDUN", "idun", "Idun.ai", "Idun Group" (in docs context)

### Positioning keywords to include naturally
- "AI agent deployment platform"
- "self-hosted"
- "open source"
- "production-ready"
- "no vendor lock-in"
- "guardrails", "observability", "memory", "MCP tooling"

## File organization

```
mintlify-docs/
├── docs.json              # Site configuration
├── CLAUDE.md              # This file
├── index.mdx              # Home/landing
├── quickstart.mdx         # Getting started
├── architecture.mdx       # System architecture
├── configuration.mdx      # Engine config reference
├── prompts.mdx            # Prompt management
├── faq.mdx                # FAQ
├── frameworks/
│   ├── overview.mdx
│   ├── langgraph.mdx
│   └── adk.mdx
├── guardrails/
│   ├── overview.mdx
│   └── reference.mdx
├── memory/
│   ├── overview.mdx
│   ├── langgraph.mdx
│   └── adk.mdx
├── observability/
│   ├── overview.mdx
│   ├── langfuse.mdx
│   ├── arize-phoenix.mdx
│   ├── langsmith.mdx
│   ├── gcp-trace.mdx
│   └── gcp-logging.mdx
├── tool-governance/
│   ├── overview.mdx
│   └── docker-toolkit.mdx
├── auth/
│   └── overview.mdx
├── integrations/
│   ├── discord.mdx
│   ├── slack.mdx
│   └── whatsapp.mdx
├── deployment/
│   ├── overview.mdx
│   └── gcp.mdx
├── manager/
│   └── overview.mdx
├── cli/
│   └── overview.mdx
├── api-reference/
│   └── introduction.mdx
├── images/
├── logo/
├── snippets/
└── styles.css
```

## Mintlify conventions

- Use `.mdx` extension for all content pages
- Internal links use root-relative paths without extensions: `/quickstart`
- Images go in `/images/` with descriptive alt text
- Reusable content goes in `/snippets/`
- New pages must be added to `docs.json` navigation
- Use Mintlify components: `<Steps>`, `<Tabs>`, `<CodeGroup>`, `<Card>`, `<Note>`, `<Warning>`
