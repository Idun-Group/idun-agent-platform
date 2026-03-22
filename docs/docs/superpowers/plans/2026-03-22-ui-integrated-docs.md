# UI-integrated docs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Manager UI documentation with automated screenshots to every feature page in the Mintlify docs.

**Architecture:** A Playwright script captures ~30 screenshots from the running dev stack. A new tutorial page provides the guided onboarding walkthrough. Then 15 existing pages get "Manager UI" tabs with embedded screenshots showing the same workflow via the web dashboard.

**Tech Stack:** Playwright, TypeScript, Mintlify MDX, Manager REST API

---

## File structure

### New files

| File | Responsibility |
|------|---------------|
| `docs/scripts/package.json` | Playwright dependency for screenshot script |
| `docs/scripts/playwright.config.ts` | Playwright configuration (base URL, viewport, timeout) |
| `docs/scripts/capture-screenshots.ts` | Screenshot automation: seed data, navigate routes, capture PNGs |
| `docs/images/ui/*.png` | ~30 captured screenshots |
| `docs/manager/tutorial.mdx` | Manager onboarding tutorial page |

### Modified files

| File | Change |
|------|--------|
| `docs/docs.json` | Add `manager/tutorial` to Manager nav group |
| `docs/quickstart.mdx` | Add screenshots inside existing Manager tab |
| `docs/frameworks/overview.mdx` | Add Manager UI tab |
| `docs/configuration.mdx` | Add Manager UI tab |
| `docs/guardrails/overview.mdx` | Add Manager UI tab |
| `docs/memory/overview.mdx` | Add Manager UI tab |
| `docs/observability/overview.mdx` | Add Manager UI tab |
| `docs/tool-governance/overview.mdx` | Add Manager UI tab |
| `docs/auth/overview.mdx` | Add Manager UI tab |
| `docs/integrations/discord.mdx` | Add Manager UI tab |
| `docs/integrations/slack.mdx` | Add Manager UI tab |
| `docs/integrations/whatsapp.mdx` | Add Manager UI tab |
| `docs/prompts.mdx` | Add Manager UI tab |
| `docs/deployment/overview.mdx` | Add Manager UI tab |
| `docs/manager/overview.mdx` | Expand with workspace/user screenshots |
| `docs/cli/overview.mdx` | Add note linking to Manager |

---

## Task 1: Playwright project setup

**Files:**
- Create: `docs/scripts/package.json`
- Create: `docs/scripts/playwright.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "idun-docs-screenshots",
  "private": true,
  "scripts": {
    "capture": "playwright test",
    "install-browsers": "playwright install chromium"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

Save to `docs/scripts/package.json`.

- [ ] **Step 2: Create playwright.config.ts**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture-screenshots.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'off',
    actionTimeout: 10_000,
  },
  timeout: 180_000,
  retries: 0,
});
```

Save to `docs/scripts/playwright.config.ts`.

- [ ] **Step 3: Install dependencies**

Run: `cd docs/scripts && npm install && npx playwright install chromium`
Expected: `node_modules` created, Chromium browser downloaded.

- [ ] **Step 4: Commit**

```bash
git add docs/scripts/package.json docs/scripts/playwright.config.ts
git commit -m "chore: add Playwright project for docs screenshots"
```

---

## Task 2: Screenshot capture script

**Files:**
- Create: `docs/scripts/capture-screenshots.ts`

- [ ] **Step 1: Write the capture script**

The script has three sections: (a) seed data via Manager API, (b) login via browser, (c) navigate and capture.

```typescript
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve(__dirname, '../images/ui');
const MANAGER_API = process.env.MANAGER_URL || 'http://localhost:8000';
const CREDENTIALS = {
  email: 'admin@idun.local',
  password: 'admin123',
  first_name: 'Admin',
  last_name: 'User',
};

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function capture(page: Page, name: string) {
  await page.waitForTimeout(500); // settle animations
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`) });
}

async function seedData(request: APIRequestContext) {
  // Try login, fall back to signup
  let loginRes = await request.post(`${MANAGER_API}/api/v1/auth/signup`, {
    data: CREDENTIALS,
    failOnStatusCode: false,
  });

  const session = await request.post(`${MANAGER_API}/api/v1/auth/login/credentials`, {
    data: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    failOnStatusCode: false,
  });

  // Create workspace
  await request.post(`${MANAGER_API}/api/v1/workspaces/`, {
    data: { name: 'Demo Workspace', slug: 'demo' },
    failOnStatusCode: false,
  });

  // Create guardrail
  await request.post(`${MANAGER_API}/api/v1/guardrails/`, {
    data: {
      name: 'PII Detection',
      guardrail_config: { config_id: 'DETECT_PII', on_fail: 'exception' },
    },
    failOnStatusCode: false,
  });

  // Create observability
  await request.post(`${MANAGER_API}/api/v1/observability/`, {
    data: {
      name: 'Langfuse Cloud',
      observability_config: {
        provider: 'LANGFUSE',
        enabled: true,
        config: { host: 'https://cloud.langfuse.com', public_key: 'pk-demo', secret_key: 'sk-demo' },
      },
    },
    failOnStatusCode: false,
  });

  // Create memory
  await request.post(`${MANAGER_API}/api/v1/memory/`, {
    data: {
      name: 'PostgreSQL Memory',
      agent_framework: 'LANGGRAPH',
      memory_config: { type: 'postgres', db_url: 'postgresql://postgres:postgres@localhost:5432/idun_agents' },
    },
    failOnStatusCode: false,
  });

  // Create MCP server
  await request.post(`${MANAGER_API}/api/v1/mcp-servers/`, {
    data: {
      name: 'Docker Time Server',
      mcp_server_config: { transport: 'stdio', command: 'docker', args: ['run', '-i', '--rm', 'mcp/time'] },
    },
    failOnStatusCode: false,
  });

  // Create prompt
  await request.post(`${MANAGER_API}/api/v1/prompts/`, {
    data: {
      prompt_id: 'system-prompt',
      content: 'You are a helpful assistant for {{ domain }}.',
      tags: ['latest'],
    },
    failOnStatusCode: false,
  });

  // Create agent
  await request.post(`${MANAGER_API}/api/v1/agents/`, {
    data: {
      name: 'Demo Agent',
      version: '1.0.0',
      description: 'LangGraph agent for documentation screenshots',
      engine_config: {
        server: { api: { port: 8008 } },
        agent: { type: 'LANGGRAPH', config: { name: 'demo', graph_definition: './agent.py:graph' } },
      },
    },
    failOnStatusCode: false,
  });
}

test('capture all screenshots', async ({ page, request }) => {
  // Seed data
  await seedData(request);

  // Login via browser
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await capture(page, 'login');

  await page.fill('input[type="email"], input[name="email"]', CREDENTIALS.email);
  await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(agents|onboarding)/, { timeout: 15000 });

  // If redirected to onboarding, capture and create workspace
  if (page.url().includes('onboarding')) {
    await capture(page, 'onboarding-workspace');
    const wsInput = page.locator('input[name="name"], input[placeholder*="workspace" i]').first();
    if (await wsInput.isVisible()) {
      await wsInput.fill('Demo Workspace');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/agents/, { timeout: 10000 });
    }
  }

  // Agent list
  await page.goto('/agents');
  await page.waitForLoadState('networkidle');
  await capture(page, 'agents-list');

  // Agent create
  await page.goto('/agents/create');
  await page.waitForLoadState('networkidle');
  await capture(page, 'agents-create-framework');

  // Agent detail (find first agent)
  await page.goto('/agents');
  await page.waitForLoadState('networkidle');
  const agentLink = page.locator('a[href*="/agents/"]').first();
  if (await agentLink.isVisible({ timeout: 5000 })) {
    await agentLink.click();
    await page.waitForLoadState('networkidle');
    await capture(page, 'agents-detail-overview');

    // Click through tabs
    const tabs = ['Gateway', 'Config', 'Prompts', 'Logs'];
    const tabNames = ['gateway', 'config', 'prompts', 'logs'];
    for (let i = 0; i < tabs.length; i++) {
      const tab = page.locator(`text="${tabs[i]}"`).first();
      if (await tab.isVisible({ timeout: 3000 })) {
        await tab.click();
        await page.waitForTimeout(1000);
        await capture(page, `agents-detail-${tabNames[i]}`);
      }
    }
  }

  // Resource pages
  const resourcePages = [
    { route: '/guardrails', name: 'guardrails-list' },
    { route: '/observability', name: 'observability-list' },
    { route: '/memory', name: 'memory-list' },
    { route: '/mcp', name: 'mcp-list' },
    { route: '/sso', name: 'sso-list' },
    { route: '/integrations', name: 'integrations-list' },
  ];

  for (const rp of resourcePages) {
    await page.goto(rp.route);
    await page.waitForLoadState('networkidle');
    await capture(page, rp.name);
  }

  // Prompts
  await page.goto('/prompts');
  await page.waitForLoadState('networkidle');
  await capture(page, 'prompts-list');

  // Users
  await page.goto('/users');
  await page.waitForLoadState('networkidle');
  await capture(page, 'users-list');

  // Settings
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await capture(page, 'settings-appearance');

  const securityTab = page.locator('text="Security"').first();
  if (await securityTab.isVisible({ timeout: 3000 })) {
    await securityTab.click();
    await page.waitForTimeout(500);
    await capture(page, 'settings-security');
  }
});
```

Save to `docs/scripts/capture-screenshots.ts`.

**Notes:**
- `failOnStatusCode: false` on all API calls makes seeding idempotent (duplicates return 409, script continues).
- The form creation screenshots (guardrails-create-form, observability-langfuse-form, etc.) can be captured in a follow-up iteration by clicking "Create" buttons on each resource page. This first version captures list views. Enhancement to capture form states can be added after verifying the base script works.

- [ ] **Step 2: Test the script runs (requires dev stack)**

Run: `cd docs/scripts && npx playwright test`
Expected: Screenshots appear in `docs/images/ui/`. Some may fail if the dev stack routes differ from expected selectors. Adjust selectors as needed.

- [ ] **Step 3: Verify screenshots**

Run: `ls -la docs/images/ui/*.png | wc -l`
Expected: 15+ PNG files (list views, detail views, settings).

- [ ] **Step 4: Commit**

```bash
git add docs/scripts/capture-screenshots.ts docs/images/ui/
git commit -m "feat: add Playwright screenshot capture script and initial screenshots"
```

---

## Task 3: Update docs.json navigation

**Files:**
- Modify: `docs/docs.json`

- [ ] **Step 1: Add tutorial page to Manager group**

In `docs.json`, find the Manager group and add `"manager/tutorial"`:

```json
{
  "group": "Manager",
  "pages": [
    "manager/overview",
    "manager/tutorial"
  ]
}
```

- [ ] **Step 2: Validate**

Run: `cd mintlify-docs && mint validate`
Expected: Warning about missing `manager/tutorial` page (we create it next task). No other errors.

- [ ] **Step 3: Commit**

```bash
git add docs/docs.json
git commit -m "chore: add manager tutorial to navigation"
```

---

## Task 4: Manager tutorial page

**Files:**
- Create: `docs/manager/tutorial.mdx`

- [ ] **Step 1: Write the tutorial page**

Create `docs/manager/tutorial.mdx` with:
- Frontmatter: title "Getting started with the Manager", description, keywords
- Prerequisites section linking to /quickstart
- Steps component walking through: Login, Create workspace, Create agent, Attach guardrails, Add observability, Verify agent, View logs
- Each step has a screenshot reference (`![description](/images/ui/filename.png)`)
- Next steps section with Cards linking to feature pages

Use `<Steps>` and `<Step>` components. Use `<Note>` for tips. Use `<Columns>` and `<Card>` for next steps.

Reference screenshots:
- `/images/ui/login.png`
- `/images/ui/onboarding-workspace.png`
- `/images/ui/agents-create-framework.png`
- `/images/ui/guardrails-list.png`
- `/images/ui/observability-list.png`
- `/images/ui/agents-detail-overview.png`
- `/images/ui/agents-detail-logs.png`

If a screenshot does not exist yet, use `<!-- TODO: add screenshot -->` as placeholder.

- [ ] **Step 2: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 3: Commit**

```bash
git add docs/manager/tutorial.mdx
git commit -m "feat: add Manager UI tutorial page"
```

---

## Task 5: Add UI tabs to quickstart page

**Files:**
- Modify: `docs/quickstart.mdx`

- [ ] **Step 1: Read the current page**

Read `docs/quickstart.mdx`. The page already has `<Tabs>` with three tabs: "Manager (recommended)", "CLI", "Manual".

- [ ] **Step 2: Add screenshots inside the Manager tab**

Inside the existing "Manager (recommended)" tab, after the Steps, add screenshots showing the UI. Insert after the "Start the platform" step and before "Create an agent" step:

Add screenshot of login page after "Open localhost:3000":
```mdx
![Login page](/images/ui/login.png)
```

Add screenshot of agent creation after "Use the UI to create a new agent":
```mdx
![Agent creation wizard](/images/ui/agents-create-framework.png)
```

Do NOT add a new tab level. The screenshots go inside the existing Manager tab's Steps.

- [ ] **Step 3: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add docs/quickstart.mdx
git commit -m "feat: add UI screenshots to quickstart Manager tab"
```

---

## Task 6: Add UI tabs to feature overview pages (batch 1)

**Files:**
- Modify: `docs/guardrails/overview.mdx`
- Modify: `docs/memory/overview.mdx`
- Modify: `docs/observability/overview.mdx`
- Modify: `docs/tool-governance/overview.mdx`

For each page, the pattern is the same:

- [ ] **Step 1: Read each page and identify where to add tabs**

Find the section that explains how to create/configure the resource. This is where the `<Tabs>` component goes, wrapping the existing YAML config content as "Config file" tab and adding a "Manager UI" tab.

- [ ] **Step 2: Add tabs to guardrails/overview.mdx**

Find the section showing guardrails YAML config. Wrap it in:
```mdx
<Tabs>
  <Tab title="Config file">
    <!-- existing YAML content -->
  </Tab>
  <Tab title="Manager UI">
    <Steps>
      <Step title="Open guardrails">
        Navigate to **Guardrails** in the sidebar.
        ![Guardrails list](/images/ui/guardrails-list.png)
      </Step>
      <Step title="Create a guardrail">
        Click **Create**. Select the guard type (PII detection, toxic language, etc.) and configure its parameters.
      </Step>
      <Step title="Assign to an agent">
        Open the agent you want to protect. Edit it and select the guardrail from the resources section. Choose the position: input, output, or both.
      </Step>
    </Steps>
  </Tab>
</Tabs>
```

- [ ] **Step 3: Add tabs to memory/overview.mdx**

Same pattern. Wrap memory config section:
```mdx
<Tab title="Manager UI">
  <Steps>
    <Step title="Open memory configs">
      Navigate to **Memory** in the sidebar.
      ![Memory configs](/images/ui/memory-list.png)
    </Step>
    <Step title="Create a memory config">
      Click **Create**. Select the backend (in-memory, SQLite, or PostgreSQL) and fill in the connection details.
    </Step>
    <Step title="Assign to an agent">
      Open the agent, edit it, and select the memory config from the resources section.
    </Step>
  </Steps>
</Tab>
```

- [ ] **Step 4: Add tabs to observability/overview.mdx**

Same pattern with observability screenshots.

- [ ] **Step 5: Add tabs to tool-governance/overview.mdx**

Same pattern with MCP screenshots.

- [ ] **Step 6: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 7: Commit**

```bash
git add docs/guardrails/overview.mdx docs/memory/overview.mdx docs/observability/overview.mdx docs/tool-governance/overview.mdx
git commit -m "feat: add Manager UI tabs to guardrails, memory, observability, tool governance"
```

---

## Task 7: Add UI tabs to remaining pages (batch 2)

**Files:**
- Modify: `docs/frameworks/overview.mdx`
- Modify: `docs/configuration.mdx`
- Modify: `docs/auth/overview.mdx`
- Modify: `docs/prompts.mdx`
- Modify: `docs/deployment/overview.mdx`

- [ ] **Step 1: Add tabs to frameworks/overview.mdx**

Show framework selection in the agent creation wizard.

- [ ] **Step 2: Add tabs to configuration.mdx**

Show the Monaco config editor in agent detail Config tab.

- [ ] **Step 3: Add tabs to auth/overview.mdx**

Show SSO config form and user management table.

- [ ] **Step 4: Add tabs to prompts.mdx**

Show prompt editor with Monaco, variable detection, and agent assignment flow.

- [ ] **Step 5: Add tabs to deployment/overview.mdx**

Show agent status toggle, health check button, restart via the UI.

- [ ] **Step 6: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 7: Commit**

```bash
git add docs/frameworks/overview.mdx docs/configuration.mdx docs/auth/overview.mdx docs/prompts.mdx docs/deployment/overview.mdx
git commit -m "feat: add Manager UI tabs to frameworks, config, auth, prompts, deployment"
```

---

## Task 8: Add UI tabs to integration pages

**Files:**
- Modify: `docs/integrations/discord.mdx`
- Modify: `docs/integrations/slack.mdx`
- Modify: `docs/integrations/whatsapp.mdx`

- [ ] **Step 1: Add tabs to discord.mdx**

Add "Manager UI" tab showing the Discord integration form with screenshot.

- [ ] **Step 2: Add tabs to slack.mdx**

Same pattern with Slack form screenshot.

- [ ] **Step 3: Add tabs to whatsapp.mdx**

Same pattern with WhatsApp form screenshot.

- [ ] **Step 4: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add docs/integrations/
git commit -m "feat: add Manager UI tabs to integration pages"
```

---

## Task 9: Expand manager overview and add CLI cross-link

**Files:**
- Modify: `docs/manager/overview.mdx`
- Modify: `docs/cli/overview.mdx`

- [ ] **Step 1: Expand manager/overview.mdx**

Add sections with screenshots for:
- Workspace management (`users-list.png`)
- User management and roles
- Agent API key generation
- Resource card grids (link to feature pages)

- [ ] **Step 2: Add Manager cross-link to cli/overview.mdx**

Add a `<Note>` at the top:
```mdx
<Note>
  For a visual interface, see [Getting started with the Manager](/manager/tutorial).
</Note>
```

- [ ] **Step 3: Validate**

Run: `cd mintlify-docs && mint validate && mint broken-links`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add docs/manager/overview.mdx docs/cli/overview.mdx
git commit -m "feat: expand manager overview with screenshots, add CLI cross-link"
```

---

## Task 10: Final validation

- [ ] **Step 1: Run full validation**

Run: `cd mintlify-docs && mint validate`
Expected: "success build validation passed"

- [ ] **Step 2: Run broken links check**

Run: `cd mintlify-docs && mint broken-links`
Expected: "success no broken links found"

- [ ] **Step 3: Verify image references**

Run: `grep -r "images/ui/" docs/*.mdx docs/**/*.mdx | wc -l`
Expected: 20+ image references across pages.

- [ ] **Step 4: Spot-check pages**

Read 3 modified pages to verify the tab structure renders correctly:
- `docs/guardrails/overview.mdx` (representative feature page)
- `docs/quickstart.mdx` (special case: existing tabs)
- `docs/manager/tutorial.mdx` (new page)

- [ ] **Step 5: Commit any fixes**

If any issues found, fix and commit.
