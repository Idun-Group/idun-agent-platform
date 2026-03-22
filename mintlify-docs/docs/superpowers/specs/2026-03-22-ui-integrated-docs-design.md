# UI-integrated documentation with automated screenshots

## Goal

Extend the existing Mintlify documentation to cover the Manager UI and Web dashboard alongside the current CLI/YAML content. Every feature page shows both paths. Screenshots are captured automatically via Playwright and embedded throughout.

## Target audience

Developers who write agent code AND use the Manager UI to deploy, monitor, and attach resources. Not a separate admin persona, but the same developer using the UI as their management interface.

## Architecture

Three deliverables:

1. **Playwright screenshot script** — captures ~30 screenshots from the running dev stack
2. **Manager tutorial page** — guided onboarding walkthrough with screenshots
3. **Integrated UI tabs** — added to 15 existing feature pages

No separate "admin" section. UI content lives inside existing pages via Mintlify `<Tabs>` components.

## Deliverable 1: Screenshot automation

### Script

- **File:** `mintlify-docs/scripts/capture-screenshots.ts`
- **Config:** `mintlify-docs/scripts/playwright.config.ts`
- **Runtime:** Playwright, installed as a devDependency in `mintlify-docs/scripts/package.json`
- **Prerequisite:** Dev stack running via `docker compose -f docker-compose.dev.yml up`
- **Output:** PNG files in `mintlify-docs/images/ui/`
- **Resolution:** 1280x800 viewport
- **Base URL:** `http://localhost:5173` (Vite dev server default). Configurable via `BASE_URL` env var for Docker setups that expose port 3000.
- **Run command:** `cd mintlify-docs/scripts && npx playwright test`

### Playwright config

```ts
// mintlify-docs/scripts/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture-screenshots.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'off', // we take manual screenshots
  },
  timeout: 120_000,
});
```

### Dev credentials

The script uses these default dev credentials (matching the dev docker-compose seed):
- **Email:** `admin@idun.local`
- **Password:** `admin123`

If the dev stack has no users (fresh database), the script first creates a user via the Manager API:
```
POST http://localhost:8000/api/v1/auth/signup
{ "email": "admin@idun.local", "password": "admin123", "first_name": "Admin", "last_name": "User" }
```

### Data seeding

Before capturing screenshots, the script seeds sample data via Manager API calls:

1. **Login** — `POST /api/v1/auth/login` (or signup if 401)
2. **Create workspace** — `POST /api/v1/workspaces/` with name "Demo Workspace"
3. **Create guardrail** — `POST /api/v1/guardrails/` with PII detection config
4. **Create observability** — `POST /api/v1/observability/` with Langfuse config (placeholder keys)
5. **Create memory** — `POST /api/v1/memory/` with PostgreSQL config
6. **Create MCP server** — `POST /api/v1/mcp-servers/` with stdio Docker MCP
7. **Create SSO config** — `POST /api/v1/sso/` with Google OIDC config (placeholder)
8. **Create integration** — `POST /api/v1/integrations/` with Discord config (placeholder)
9. **Create prompt** — `POST /api/v1/prompts/` with sample system prompt
10. **Create agent** — `POST /api/v1/agents/` with LangGraph config, attaching all resources above

All API calls go to `http://localhost:8000` (Manager API). Session cookie from login is reused.

### Wait strategy

For each page capture:
- `page.goto(url, { waitUntil: 'networkidle' })` — wait for API calls to complete
- `page.waitForSelector('[data-testid="page-content"]', { timeout: 10000 })` — wait for main content (fall back to `main` or `body` if no test ID)
- `page.waitForTimeout(500)` — brief settle time for animations
- For Monaco editor pages, additionally: `page.waitForSelector('.monaco-editor', { timeout: 15000 })`

### Screenshot inventory

The script captures these screens (~30 total):

**Auth and onboarding:**
- `login.png` — Login page
- `onboarding-workspace.png` — First workspace creation

**Agent management:**
- `agents-list.png` — Agent dashboard with agent cards
- `agents-create-framework.png` — Agent creation wizard, framework selection step
- `agents-create-resources.png` — Agent creation wizard, resource selection step
- `agents-detail-overview.png` — Agent detail, overview tab
- `agents-detail-gateway.png` — Agent detail, gateway tab
- `agents-detail-config.png` — Agent detail, config tab (Monaco editor)
- `agents-detail-prompts.png` — Agent detail, prompts tab
- `agents-detail-logs.png` — Agent detail, logs tab

**Resource management:**
- `guardrails-list.png` — Guardrails card grid
- `guardrails-create-form.png` — Guardrail creation form
- `observability-list.png` — Observability configs card grid
- `observability-langfuse-form.png` — Langfuse config form
- `memory-list.png` — Memory configs card grid
- `memory-create-form.png` — Memory config creation form
- `mcp-list.png` — MCP servers card grid
- `mcp-create-form.png` — MCP server creation form
- `sso-list.png` — SSO configs card grid
- `sso-create-form.png` — SSO config creation form
- `integrations-list.png` — Integrations card grid
- `integrations-discord-form.png` — Discord integration form
- `integrations-slack-form.png` — Slack integration form
- `integrations-whatsapp-form.png` — WhatsApp integration form

**Prompts:**
- `prompts-list.png` — Prompts list
- `prompts-create-form.png` — Prompt creation with Monaco editor

**Users and settings:**
- `users-list.png` — User management table
- `settings-appearance.png` — Settings, appearance tab
- `settings-security.png` — Settings, security tab

**Naming convention:** `{section}-{action}.png`

### Maintenance

Run the script after UI changes. Screenshots overwrite existing files at the same paths, so docs stay current without editing `.mdx` files. The script is idempotent: seeding checks for existing data by name before creating.

## Deliverable 2: Manager tutorial page

### File: `mintlify-docs/manager/tutorial.mdx`

A step-by-step guided walkthrough for first-time Manager UI users.

### Structure

```
---
title: "Getting started with the Manager"
description: "Deploy and manage your first agent using the Idun web dashboard."
keywords: ["manager", "web UI", "dashboard", "tutorial", "agent management"]
---

## Prerequisites
- Dev stack running (docker compose)
- Link to /quickstart for setup

## Step 1: Log in
- Screenshot: login.png
- Default credentials or OIDC

## Step 2: Create a workspace
- Screenshot: onboarding-workspace.png
- Workspace name and purpose

## Step 3: Create an agent
- Screenshot: agents-create-framework.png
- Walk through the wizard: name, framework, config
- Screenshot: agents-create-resources.png
- Select memory, observability, guardrails

## Step 4: Attach guardrails
- Screenshot: guardrails-create-form.png
- Create a PII detection guardrail
- Assign it to the agent at input position

## Step 5: Add observability
- Screenshot: observability-langfuse-form.png
- Create a Langfuse config
- Assign it to the agent

## Step 6: Verify the agent
- Screenshot: agents-detail-overview.png
- Health check button
- Status indicators

## Step 7: View logs
- Screenshot: agents-detail-logs.png
- Real-time log viewer

## Next steps
- Cards linking to feature-specific pages
```

### Navigation update

Add to `docs.json` under the Manager group:

```json
{
  "group": "Manager",
  "pages": [
    "manager/overview",
    "manager/tutorial"
  ]
}
```

## Deliverable 3: Integrated UI tabs

### Pattern

For pages that do NOT already have tabs, add a `<Tabs>` component wrapping the existing content and new UI content:

```mdx
## Create a guardrail

<Tabs>
  <Tab title="Config file">
    <!-- existing YAML config content -->
  </Tab>
  <Tab title="Manager UI">
    <Steps>
      <Step title="Open guardrails">
        Navigate to **Guardrails** in the sidebar.
        ![Guardrails list](/images/ui/guardrails-list.png)
      </Step>
      <Step title="Create new guardrail">
        Click **Create**, select the guard type, and fill in the config.
        ![Guardrail form](/images/ui/guardrails-create-form.png)
      </Step>
      <Step title="Assign to agent">
        Open the agent detail page, edit the agent, and select the guardrail under resources.
      </Step>
    </Steps>
  </Tab>
</Tabs>
```

### Quickstart integration

The `quickstart.mdx` page already uses `<Tabs>` with three tabs: "Manager (recommended)", "CLI", and "Manual". For this page, enhance the existing Manager tab by adding screenshots inside it. Do NOT add a nested tab layer.

### Pages to modify

| Page | UI content to add |
|------|------------------|
| `quickstart.mdx` | Add screenshots inside existing Manager tab (workspace creation, agent wizard) |
| `frameworks/overview.mdx` | Tab showing framework selection in agent creation wizard |
| `configuration.mdx` | Tab showing Monaco config editor in agent detail |
| `guardrails/overview.mdx` | Tab showing guardrail CRUD and assignment to agents |
| `memory/overview.mdx` | Tab showing memory config CRUD and backend selection |
| `observability/overview.mdx` | Tab showing observability provider config forms |
| `tool-governance/overview.mdx` | Tab showing MCP server creation and transport config |
| `auth/overview.mdx` | Tab showing SSO config form + user/role management |
| `integrations/discord.mdx` | Tab showing Discord integration form |
| `integrations/slack.mdx` | Tab showing Slack integration form |
| `integrations/whatsapp.mdx` | Tab showing WhatsApp integration form |
| `prompts.mdx` | Tab showing prompt editor, variable detection, agent assignment |
| `deployment/overview.mdx` | Tab showing agent status toggle, health check, restart |
| `manager/overview.mdx` | Expand with workspace management screenshots, user table, API key generation |
| `cli/overview.mdx` | Note linking to Manager as alternative, no tab needed |

### Image references

All images use root-relative paths:
```
![Agent list](/images/ui/agents-list.png)
```

Alt text describes the screen content for accessibility and AI indexing.

## What's excluded (YAGNI)

- Video tutorials
- Separate admin/governance section
- Localized screenshots
- Mobile/responsive screenshots
- Storybook component documentation
- Automated screenshot diffing / visual regression
- CI pipeline for screenshots (run manually for now)
- Screenshots for low-value pages: home `/`, registration `/signin`, observation `/observation`, settings profile/language/notifications tabs

## Testing approach

1. Run dev stack via `docker compose -f docker-compose.dev.yml up`
2. Run Playwright script, verify all ~30 screenshots captured in `images/ui/`
3. Run script a second time to verify idempotency (same output, no duplicate data)
4. Run `mint validate` — build passes
5. Run `mint broken-links` — no broken image references
6. Run `mint dev` — visual review of pages with screenshots
7. Verify quickstart page renders correctly (existing tabs + new screenshots, no nesting issues)

## Dependencies

- Playwright (installed in `mintlify-docs/scripts/package.json`)
- Dev stack running (PostgreSQL + Manager + Web UI)
- Manager API accessible at `http://localhost:8000`
- Web UI accessible at `http://localhost:5173` (or `http://localhost:3000` via Docker)
