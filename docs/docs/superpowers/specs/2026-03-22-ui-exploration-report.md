# Idun Platform UI exploration report

> Generated from Playwright-driven exploration of the live platform on 2026-03-22.
> Account: test@idun-group.com | Platform: http://localhost:3000

## Executive summary

The UI has been completely reworked since the initial docs migration. The old documentation describes generic CRUD card grids and a basic tabbed agent detail view. The actual UI now features a catalog-based resource management pattern, a 3-step agent creation wizard, a built-in AG-UI chat playground, an API integration tab with key management, and a "Connect to Platform" enrollment flow that is central to the product's value proposition.

The current docs need a full rewrite of all Manager UI tabs and the tutorial page to match the new interface.

---

## 1. Login

- Standard email/password form
- Title: "Login to your Idun Platform account"
- Fields: Email address, Password
- Links: "Don't have an account? Sign up" and "Book a meeting with the team"
- No OIDC/Google login button visible (likely behind `AUTH__DISABLE_USERNAME_PASSWORD` flag)

## 2. Agent dashboard (`/agents`)

### Layout
- Page title: "Agent Dashboard" with subtitle "Manage and monitor your AI agents"
- Top-right: "Create an agent" button
- Bottom: "Connect a new agent — Configure from a template or connect" CTA card

### Agent cards
Each agent displays as a horizontal card with:
- **Agent name** (clickable, navigates to detail)
- **Framework badge**: "LangGraph" or "ADK" (color-coded)
- **Status badge**: "Draft" or "Active"
- **Resource indicators**: OBS, MEM, GUARD, MCP, SSO, INT — each lit or unlit depending on whether that resource type is attached
- **Metrics** (UI-ready, backend planned): Runs (24h), Avg Latency, Error Rate — currently show "—"

### Search
- Search bar: "Type agent name or framework..."

### Observed agents (test account)
11 agents visible: mix of LangGraph and ADK, some Draft, some Active. Names include "Agent 1", "Langgraph tool", "langgraph-structured", "adk-structured", "web-agent", "Crawler", "Mon agent Matthieu".

---

## 3. Agent creation wizard (`/agents/create`)

### Step 1: Basics
- Title: "Name your agent — Choose a name and select your agent framework"
- Fields:
  - Agent Name (required, placeholder: "My first agent")
  - Agent Framework: radio card selection
    - **LangGraph** — "Build stateful, multi-actor agents with LangGraph"
    - **Google ADK** — "Build agents with Google's Agent Development Kit"
- Buttons: Cancel, Next

### Step 2: Framework config
- Title: "Configure your LangGraph agent — Provide the required configuration for your framework"
- Fields:
  - Graph Definition (required) — "Path to your graph file and compiled graph attribute (e.g. ./agent/graph.py:graph)"
  - Agent Host: toggle between "Localhost" and "Remote"
  - Server Port — with live preview: "Your agent will be accessible at http://localhost:8800"
- Includes: "LangGraph Quick Start" help link
- Buttons: Back, Next (disabled until required fields filled)

### Step 3: Enrollment
- **This is the key onboarding step.** After agent creation, the user returns to their own codebase and:
  1. Sets `IDUN_MANAGER_HOST` and `IDUN_AGENT_API_KEY` environment variables
  2. Installs `idun-agent-engine`
  3. Runs `idun agent serve --source manager`
  4. The agent connects to the platform, fetches its config, and starts with all configured features

---

## 4. Agent detail (`/agents/:id`)

### Header
- "Back to Agents" link
- Agent name + Status badge (DRAFT/ACTIVE)
- Agent ID (UUID)
- Framework badge (LANGGRAPH/ADK)
- **Restart** button — calls `/reload` on the running engine to re-fetch config
- **Edit Agent** button

### Tab: Overview (default)
- **Connect to Platform** section — "How to run and connect this agent" guidance
- **Agent Graph** — visual graph representation (may show "Could not load graph" if agent not running)
- **Agent Details** table:
  - Name, Description, Version, Base URL, Server Port, Status, Created, Last Updated
- **Framework Configuration**:
  - Framework, Graph Definition, Checkpointer
- **Resources & Integrations** — each resource type with current state:
  - Memory: shows attached config (e.g., "In-Memory") with "Manage →" link
  - Observability: "Add observability" button
  - MCP Servers: "Add mcp servers" button
  - Guardrails: "Add guardrails" button
  - SSO: "Add sso" button
  - Integrations: "Add integrations" button

### Tab: Chat
- **Built-in AG-UI chat playground** — test the agent directly from the dashboard
- Endpoint selector: AG-UI, AG-UI Stream, Custom Stream
- Thread management: thread selector with refresh and clear buttons
- Config panel toggle
- Events panel (expandable sidebar showing streaming events)
- Chat input with send button
- Status: "Capabilities unavailable — using chat mode" (when agent not running)
- Supports cURL export of requests

### Tab: API Integration
- **Endpoint Details**:
  - Base URL (e.g., http://localhost:8825)
  - Authorization key (masked, with "Show Key" toggle)
  - Available Endpoints listing
- "View Docs" link to engine OpenAPI docs

### Tab: Prompts
- Lists prompts assigned to this agent
- Empty state: "No prompts assigned — Assign prompts to this agent from the Prompts page"

### Tab: Configuration
- Summary: Framework, Port, Memory type
- **Engine Config viewer** with JSON/YAML toggle and Copy button
- Full materialized engine config displayed in a code editor (read-only)
- Shows the complete config the agent receives from the platform

---

## 5. Resource management pages

All resource pages follow a new **catalog pattern**: provider/type cards with "+" buttons to create, organized by category. Each has a search bar. Existing configs appear as cards with Edit/Remove actions and "Used by N agents" badges.

### Guardrails (`/guardrails`)
- Title: "Guardrails — Enforce safety rules and content policies on your agents"
- **Requires Guardrails AI API key** (banner at top with docs link)
- Categories:
  - **Content Safety**: Ban List (+), NSFW Text (+), Toxic Language (+), Gibberish Text (+), Code Scanner (Soon)
  - **Identity & Security**: Detect PII (+), Detect Jailbreak (Soon), Prompt Injection (Soon)
  - **Enterprise**: Model Armor (Soon), Custom LLM (Soon)
  - **Context & Quality**: Bias Check (+), Competition Check (+), Correct Language (+), Restrict Topic (+), RAG Hallucination (Soon)
- Create form example (Ban List):
  - Guardrail Name
  - Guardrails AI API Key (required, with link to hub.guardrailsai.com)
  - Banned Words/Phrases (one per line)
  - Rejection Message (optional)
  - Cancel / Add Ban List buttons
- Existing configs show: name, type badge, category, description, used-by count, Edit/Remove

### Observability (`/observability`)
- Title: "Observability"
- Available providers:
  - **Active**: Langfuse (+), Phoenix (+), LangSmith (+), GCP Logging (+), GCP Trace (+)
  - **Planned**: Datadog APM (Soon), AWS X-Ray (Soon), Azure Monitor (Soon), Jaeger (Soon)
- "Request a provider" link

### Memory Stores (`/memory`)
- Title: "Memory Stores"
- Available backends:
  - SQLite (+), PostgreSQL (+), In Memory (+), Vertex AI (+), Database (+)
- "Request a store" link
- Existing configs show: name, type, Edit/Remove buttons

### MCP Servers (`/mcp`)
- Title: "MCP Servers"
- Transport types:
  - Streamable HTTP (+), SSE (+), WebSocket (+), STDIO (+)
- "Request a transport" link
- **Quick Start Guide** (collapsible) with copy-able code snippets
- **"Discover tools"** button on existing configs
- Existing configs show: name, transport, command/URL, Edit/Remove

### SSO / OIDC (`/sso`)
- Title: "SSO / OIDC"
- "+ Add SSO config" button
- Existing configs show: name, Edit/Remove
- "+Add SSO configuration" CTA at bottom

### Integrations (`/integrations`)
- Title: "Integrations"
- Available channels:
  - **Active**: WhatsApp (+), Discord (+), Slack (+)
  - **Planned**: Microsoft Teams (Soon), Telegram (Soon), LINE (Soon), Notion (Soon), Google Chat (Soon)
- "Request an integration" link

---

## 6. User management (`/users`)
- Title: "User Management"
- "Add user" button
- Table columns: Name, Email, Role, Actions
- Pagination: Previous/Next with page numbers
- Search: "Search users by name, email or role..."

## 7. Settings (`/settings`)
- Title: "Settings"
- Two tabs: **General**, **Users**
- General: Workspace name field with Save button
- Users: (likely same as /users management)

---

## Key differences from current documentation

| Area | Current docs say | UI actually shows |
|------|-----------------|-------------------|
| Agent dashboard | Generic list with search/pagination | Card-based dashboard with framework badges, status badges, resource indicators, metrics placeholders |
| Agent creation | Vague "multi-step wizard" | Specific 3-step: Basics → Framework Config → Enrollment |
| Agent detail tabs | Overview, Gateway, Config, Prompts, Logs | Overview, **Chat**, **API Integration**, Prompts, Configuration |
| Chat playground | Not documented | Built-in AG-UI playground with endpoint selector, thread management, events viewer |
| API Integration | Not documented | Dedicated tab with base URL, auth key management, endpoint listing |
| Connect to Platform | Not documented | Enrollment flow: set env vars, install engine, run agent |
| Guardrails | Generic CRUD form | Catalog by category (Content Safety, Identity & Security, Enterprise, Context & Quality) with per-type create forms |
| Observability | Generic CRUD form | Provider catalog with active/planned badges |
| MCP | Generic CRUD form | Transport-type catalog with Quick Start Guide and "Discover tools" |
| Memory | Generic CRUD form | Backend catalog (SQLite, PostgreSQL, In Memory, Vertex AI, Database) |
| Integrations | Generic CRUD form | Channel catalog with active/planned badges |
| Agent metrics | Not mentioned | UI-ready (Runs/24h, Avg Latency, Error Rate) but backend not built |
| Gateway tab | Documented | No longer exists (replaced by API Integration) |
| Logs tab | Documented | No longer exists (replaced by Chat with events viewer) |

## Hero workflow for documentation

The primary user journey the docs should walk through:

1. **Sign up / Log in**
2. **Create an agent** — 3-step wizard (name, framework config, enrollment instructions)
3. **Enroll the agent** — set env vars in code, install engine, run with `--source manager`
4. **Agent connects** — appears as "Active" on dashboard
5. **Test via Chat** — use built-in AG-UI playground to verify the agent works
6. **Add resources** — from agent detail Overview tab, attach guardrails, observability, MCP, memory, SSO, integrations
7. **Reload** — click Restart to push new config to the running agent
8. **Monitor** — check Chat events, API Integration tab for endpoint details, Configuration tab for full engine config

## Planned features to acknowledge (not document as working)

- Agent metrics (Runs/24h, Avg Latency, Error Rate)
- Guardrails: Code Scanner, Detect Jailbreak, Prompt Injection, Model Armor, Custom LLM, RAG Hallucination
- Observability: Datadog APM, AWS X-Ray, Azure Monitor, Jaeger
- Integrations: Microsoft Teams, Telegram, LINE, Notion, Google Chat
