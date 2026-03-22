import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:8000';
const EMAIL = 'admin@idunplatform.com';
const PASSWORD = 'admin123';
const IMAGES_DIR = path.resolve(__dirname, '../images/ui');

async function save(page: import('@playwright/test').Page, name: string) {
  const dest = path.join(IMAGES_DIR, `${name}.png`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, fullPage: false });
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

test('capture documentation screenshots', async ({ page, request }) => {
  // -----------------------------------------------------------------------
  // 1. Seed data via Manager API
  // -----------------------------------------------------------------------

  // Signup (ignore errors — user may already exist)
  await request.post(`${MANAGER_URL}/api/v1/auth/basic/signup`, {
    data: {
      email: EMAIL,
      password: PASSWORD,
      first_name: 'Admin',
      last_name: 'User',
    },
    failOnStatusCode: false,
  });

  // Login to get session cookie
  const loginRes = await request.post(`${MANAGER_URL}/api/v1/auth/basic/login`, {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false,
  });

  // Extract Set-Cookie header for subsequent seeding requests
  const setCookie = loginRes.headers()['set-cookie'] ?? '';
  const sessionCookie = setCookie.split(';')[0]; // e.g. "session=..."

  const headers: Record<string, string> = sessionCookie
    ? { Cookie: sessionCookie }
    : {};

  // Create workspace
  await request.post(`${MANAGER_URL}/api/v1/workspaces/`, {
    data: { name: 'Demo Workspace', slug: 'demo-workspace' },
    headers,
    failOnStatusCode: false,
  });

  // Create guardrail
  await request.post(`${MANAGER_URL}/api/v1/guardrails/`, {
    data: {
      name: 'Demo Guardrail',
      guardrail_config: {
        type: 'topic_restriction',
        allowed_topics: ['support', 'sales'],
      },
    },
    headers,
    failOnStatusCode: false,
  });

  // Create observability config
  await request.post(`${MANAGER_URL}/api/v1/observability/`, {
    data: {
      name: 'Demo Observability',
      observability_config: {
        type: 'langfuse',
        public_key: 'pk-demo',
        secret_key: 'sk-demo',
        host: 'https://cloud.langfuse.com',
      },
    },
    headers,
    failOnStatusCode: false,
  });

  // Create memory config
  await request.post(`${MANAGER_URL}/api/v1/memory/`, {
    data: {
      name: 'Demo Memory',
      agent_framework: 'langgraph',
      memory_config: {
        type: 'in_memory',
      },
    },
    headers,
    failOnStatusCode: false,
  });

  // Create MCP server
  await request.post(`${MANAGER_URL}/api/v1/mcp-servers/`, {
    data: {
      name: 'Demo MCP Server',
      mcp_server_config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
    headers,
    failOnStatusCode: false,
  });

  // Create prompt
  await request.post(`${MANAGER_URL}/api/v1/prompts/`, {
    data: {
      prompt_id: 'demo-system-prompt',
      content: 'You are a helpful assistant for the Demo Workspace.',
      tags: ['demo', 'system'],
    },
    headers,
    failOnStatusCode: false,
  });

  // Create agent
  const agentRes = await request.post(`${MANAGER_URL}/api/v1/agents/`, {
    data: {
      name: 'Demo Agent',
      version: '1.0.0',
      description: 'A demonstration LangGraph agent.',
      engine_config: {
        framework: 'langgraph',
        agent_module: 'demo_agent.graph',
        agent_attribute: 'graph',
        env_vars: {},
      },
    },
    headers,
    failOnStatusCode: false,
  });

  let agentId: string | null = null;
  try {
    const agentJson = await agentRes.json();
    agentId = agentJson?.id ?? agentJson?.agent_id ?? null;
  } catch {
    // ignore parse errors
  }

  // -----------------------------------------------------------------------
  // 2. Capture login page BEFORE logging in
  // -----------------------------------------------------------------------

  await page.goto('/login');
  await settle(page);
  await save(page, 'login');

  // -----------------------------------------------------------------------
  // 3. Login via browser
  // -----------------------------------------------------------------------

  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await settle(page);

  // Handle onboarding redirect
  if (page.url().includes('/onboarding')) {
    await save(page, 'onboarding-workspace');
    try {
      // Try to complete onboarding
      const wsInput = page.locator('input').first();
      await wsInput.waitFor({ timeout: 3000 });
      await wsInput.fill('Demo Workspace');
      await page.locator('button[type="submit"]').first().click({ timeout: 3000 });
      await page.waitForTimeout(2000);
    } catch {
      // Onboarding form structure unknown, skip
    }
    await page.goto('/agents');
    await settle(page);
  }

  // -----------------------------------------------------------------------
  // 4. Agents list
  // -----------------------------------------------------------------------

  await page.goto('/agents');
  await settle(page);
  await save(page, 'agents-list');

  // -----------------------------------------------------------------------
  // 5. Agent create wizard
  // -----------------------------------------------------------------------

  await page.goto('/agents/create');
  await settle(page);
  await save(page, 'agents-create-framework');

  // -----------------------------------------------------------------------
  // 6. Agent detail tabs
  // -----------------------------------------------------------------------

  // Determine agent ID: use seeded ID or fetch first from list
  if (!agentId) {
    await page.goto('/agents');
    await settle(page);
    // Try to pick the first agent link
    const firstAgentLink = page.locator('a[href^="/agents/"]').first();
    if (await firstAgentLink.isVisible()) {
      const href = await firstAgentLink.getAttribute('href');
      const match = href?.match(/\/agents\/([^/]+)/);
      if (match) agentId = match[1];
    }
  }

  if (agentId) {
    const detailBase = `/agents/${agentId}`;

    // Overview tab (default)
    await page.goto(detailBase);
    await settle(page);
    await save(page, 'agents-detail-overview');

    // Gateway tab
    const gatewayTab = page.locator('[role="tab"]', { hasText: /gateway/i }).first();
    if (await gatewayTab.isVisible()) {
      await gatewayTab.click();
      await settle(page);
    } else {
      await page.goto(`${detailBase}?tab=gateway`);
      await settle(page);
    }
    await save(page, 'agents-detail-gateway');

    // Config tab
    const configTab = page.locator('[role="tab"]', { hasText: /config/i }).first();
    if (await configTab.isVisible()) {
      await configTab.click();
      await settle(page);
    } else {
      await page.goto(`${detailBase}?tab=config`);
      await settle(page);
    }
    await save(page, 'agents-detail-config');

    // Prompts tab
    const promptsTab = page.locator('[role="tab"]', { hasText: /prompt/i }).first();
    if (await promptsTab.isVisible()) {
      await promptsTab.click();
      await settle(page);
    } else {
      await page.goto(`${detailBase}?tab=prompts`);
      await settle(page);
    }
    await save(page, 'agents-detail-prompts');

    // Logs tab
    const logsTab = page.locator('[role="tab"]', { hasText: /log/i }).first();
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await settle(page);
    } else {
      await page.goto(`${detailBase}?tab=logs`);
      await settle(page);
    }
    await save(page, 'agents-detail-logs');
  } else {
    // Fallback: just screenshot whatever is at /agents/:nonexistent
    for (const name of [
      'agents-detail-overview',
      'agents-detail-gateway',
      'agents-detail-config',
      'agents-detail-prompts',
      'agents-detail-logs',
    ]) {
      await page.goto('/agents');
      await settle(page);
      await save(page, name);
    }
  }

  // -----------------------------------------------------------------------
  // 7. Config CRUD pages
  // -----------------------------------------------------------------------

  const crudRoutes: Array<[string, string]> = [
    ['guardrails', 'guardrails-list'],
    ['observability', 'observability-list'],
    ['memory', 'memory-list'],
    ['mcp', 'mcp-list'],
    ['sso', 'sso-list'],
    ['integrations', 'integrations-list'],
  ];

  for (const [route, screenshotName] of crudRoutes) {
    await page.goto(`/${route}`);
    await settle(page);
    await save(page, screenshotName);

    // Try to capture the create form
    try {
      const createBtn = page.locator('button, a').filter({ hasText: /create|add|new/i }).first();
      if (await createBtn.isVisible({ timeout: 2000 })) {
        await createBtn.click();
        await page.waitForTimeout(1000);
        const formName = screenshotName.replace('-list', '-create-form');
        await save(page, formName);
        await page.goto(`/${route}`);
        await settle(page);
      }
    } catch {
      // Create button not found or form didn't open, skip
    }
  }

  // Capture specific integration form screenshots
  for (const [provider, formName] of [
    ['discord', 'integrations-discord-form'],
    ['slack', 'integrations-slack-form'],
    ['whatsapp', 'integrations-whatsapp-form'],
  ] as const) {
    try {
      await page.goto('/integrations');
      await settle(page);
      const createBtn = page.locator('button, a').filter({ hasText: /create|add|new/i }).first();
      if (await createBtn.isVisible({ timeout: 2000 })) {
        await createBtn.click();
        await page.waitForTimeout(1000);
        const opt = page.locator(`text=${provider}`).first();
        if (await opt.isVisible({ timeout: 2000 })) {
          await opt.click();
          await page.waitForTimeout(500);
        }
        await save(page, formName);
      }
    } catch {
      // Skip this provider form
    }
  }

  // -----------------------------------------------------------------------
  // 8. Prompts list (route may not exist — skip on 404 / redirect)
  // -----------------------------------------------------------------------

  await page.goto('/prompts');
  await settle(page);
  if (!page.url().includes('/login')) {
    await save(page, 'prompts-list');
  }

  // -----------------------------------------------------------------------
  // 9. Users
  // -----------------------------------------------------------------------

  await page.goto('/users');
  await settle(page);
  await save(page, 'users-list');

  // -----------------------------------------------------------------------
  // 10. Settings
  // -----------------------------------------------------------------------

  await page.goto('/settings');
  await settle(page);
  await save(page, 'settings-appearance');

  // Security tab
  const securityTab = page.locator('[role="tab"]', { hasText: /security/i }).first();
  if (await securityTab.isVisible()) {
    await securityTab.click();
    await settle(page);
  } else {
    await page.goto('/settings?tab=security');
    await settle(page);
  }
  await save(page, 'settings-security');
});
