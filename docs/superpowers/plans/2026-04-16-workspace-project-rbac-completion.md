# Workspace / Project RBAC Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Workspace/Project RBAC feature so the frontend fully matches the spec — role gating is enforced on every scoped page, cross-project resource references are prevented in the UI (not just rejected by the backend), the Workspace Users i18n bug is fixed, and the full feature is validated end-to-end in the browser across all roles.

**Architecture:** Backend work (data model, APIs, migration, validation) is already complete and tested. Frontend foundations — `useProject()` exposing `canWrite`/`canAdmin`, `useWorkspace()` exposing `isCurrentWorkspaceOwner`, header injection for `X-Workspace-Id`/`X-Project-Id` in `src/utils/api.ts`, top-navbar selectors, project/member settings surfaces — are also in place. What remains is (a) patching remaining ungated pages to use those hooks, (b) filtering resource pickers by project, (c) a single i18n key fix, (d) an ops rebuild to ship backend fixes, and (e) thorough browser validation per role.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, styled-components, React Router 7, i18next (7 locales, default fr), Vitest (unit/component), Playwright (e2e), `@ag-ui/client`. Manager backend: FastAPI + PostgreSQL 16 via Alembic. Dev stack runs through `docker-compose.dev.yml`.

**Out of scope for this plan:**
- Any broader non-RBAC TypeScript debt in the repo (frontend `tsc --noEmit` in `services/idun_agent_web` is currently clean — if debt surfaces elsewhere, file separately).
- Policy engine, SCIM, IdP group sync, service accounts — per spec "Non-Goals".

---

## Chunk 1: Ops Unblock & i18n Bug

### Task 1: Rebuild manager + verify migration / secret fixes live

**Files:**
- Reference: `docker-compose.dev.yml`
- Reference: `services/idun_agent_manager/alembic/versions/` (most recent revision should be the RBAC one)

- [ ] **Step 1: Stop running stack**

Run: `docker compose -f docker-compose.dev.yml down`
Expected: containers stopped, no errors.

- [ ] **Step 2: Rebuild with no cache to guarantee stale image is replaced**

Run: `docker compose -f docker-compose.dev.yml build --no-cache manager`
Expected: clean build, no cached layers used for the manager image.

- [ ] **Step 3: Start the stack**

Run: `docker compose -f docker-compose.dev.yml up -d`
Expected: postgres, manager, web containers all `Up`.

- [ ] **Step 4: Confirm Alembic resolves head (no revision mismatch)**

Run: `docker compose -f docker-compose.dev.yml logs manager | grep -Ei 'alembic|revision|upgrade' | tail -40`
Expected: NO `Can't locate revision identified by 9c8b7a6d5e4f`. Expect a successful `Running upgrade ... -> <head>` line or an idempotent `head` log.

- [ ] **Step 5: Confirm `AUTH__SECRET_KEY` is resolved and the manager is healthy**

Run: `curl -s http://localhost:8000/healthz && docker compose -f docker-compose.dev.yml logs manager | grep -Ei 'AUTH__SECRET_KEY|secret_key' | tail -20`
Expected: healthz returns `200 OK`, no `AUTH__SECRET_KEY environment variable is required` error in logs.

- [ ] **Step 6: Smoke-test agent API key generation to confirm the secret fix**

Manually: log in to the web UI, open an existing agent, try regenerating an API key (or create a test agent and issue a key).
Expected: the key is generated and displayed; no secret-key error toast; backend logs show no exception.

- [ ] **Step 7: No commit needed (ops task). Note the outcome in your session log.**

---

### Task 2: Diagnose the Workspace Users i18n error

**Files:**
- Search scope: `services/idun_agent_web/src/**/*.{ts,tsx}`
- Reference: `services/idun_agent_web/src/i18n/locales/{en,fr,de,es,ru,pt,it}.json`

- [ ] **Step 1: Reproduce the bug in the browser**

Log in as a workspace owner, go to Settings → Workspace → Users. Confirm the string `key 'settings.workspaces.users (en)' returned an object instead of string.` renders somewhere on the page.
Take note of *where exactly* it appears (tab label? section header? table? modal?). Screenshot or jot the position.

- [ ] **Step 2: Reason about the key shape**

Open `services/idun_agent_web/src/i18n/locales/en.json`. Inspect `settings.workspaces.users` — it is an object with many nested keys (e.g. `modal`, `name`, `email`, `role`, `confirmRoleTitle`, etc.). Any `t('settings.workspaces.users')` without a subkey, OR any `t('settings.workspaces.users.<x>')` where `<x>` is itself an object and not a leaf string, will trigger this error.

- [ ] **Step 3: Grep for stray calls**

Run the following greps (use the Grep tool) and record results:
- Pattern: `t\(['"]settings\.workspaces\.users['"]\s*[,)]` — bare call with no subkey.
- Pattern: `t\(['"]settings\.workspaces\.users\.[a-zA-Z]+['"]\s*[,)]` — top-level subkeys only; cross-check each against the JSON to see if any such subkey is itself an object rather than a string.
- Pattern: `settings\.workspaces\.users\.` in non-`.tsx` files (locale files themselves excluded) — catches template-constructed keys like `` `settings.workspaces.users.${foo}` ``.

- [ ] **Step 4: Identify the culprit**

The likely cases:
a) a bare `t('settings.workspaces.users', '...')` somewhere (e.g. a page subtitle or group label).
b) a dynamic key `t(\`settings.workspaces.users.${key}\`)` where `key` can be a value like `modal` or `perm` which resolves to an object.
c) a locale file where a non-English translator left an object at a key that's a string in `en.json` — check `fr.json`, `de.json`, `es.json`, `ru.json`, `pt.json`, `it.json` for `settings.workspaces.users` having a shape mismatch with `en.json`.

Record which one it is before moving on.

- [ ] **Step 5: Write a failing test**

Create `services/idun_agent_web/src/components/settings/workspace-users/component.i18n.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import en from '../../../i18n/locales/en.json';
import fr from '../../../i18n/locales/fr.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import ru from '../../../i18n/locales/ru.json';
import pt from '../../../i18n/locales/pt.json';
import it from '../../../i18n/locales/it.json';

// Every leaf reached from settings.workspaces.users should be a string
// in every locale, OR every locale should agree it's a nested object.
// The shape of settings.workspaces.users must match the English shape.
type AnyObj = Record<string, unknown>;

function shape(value: unknown): 'string' | 'object' | 'other' {
  if (typeof value === 'string') return 'string';
  if (value && typeof value === 'object') return 'object';
  return 'other';
}

function walk(refObj: AnyObj, candObj: AnyObj, path: string, errors: string[]) {
  for (const k of Object.keys(refObj)) {
    const refVal = refObj[k];
    const candVal = candObj?.[k];
    const p = `${path}.${k}`;
    if (shape(refVal) !== shape(candVal)) {
      errors.push(`${p}: ref=${shape(refVal)} cand=${shape(candVal)}`);
      continue;
    }
    if (shape(refVal) === 'object') {
      walk(refVal as AnyObj, (candVal ?? {}) as AnyObj, p, errors);
    }
  }
}

describe('settings.workspaces.users i18n shape', () => {
  const ref = (en as AnyObj).settings as AnyObj;
  const refUsers = (ref.workspaces as AnyObj).users as AnyObj;

  it.each([
    ['fr', fr],
    ['de', de],
    ['es', es],
    ['ru', ru],
    ['pt', pt],
    ['it', it],
  ])('shape matches en for %s', (_, locale) => {
    const lu = (((locale as AnyObj).settings as AnyObj)?.workspaces as AnyObj)?.users as AnyObj;
    const errors: string[] = [];
    walk(refUsers, lu ?? {}, 'settings.workspaces.users', errors);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the test and inspect failures**

Run: `cd services/idun_agent_web && npx vitest run src/components/settings/workspace-users/component.i18n.test.tsx`
Expected: FAIL if (c) is the cause, with a specific path like `settings.workspaces.users.xxx: ref=string cand=object`. PASS if (a) or (b) is the cause.

If it PASSES, the bug is case (a) or (b) — skip step 7 shape fixes and go straight to the call-site fix below.

- [ ] **Step 7: Fix the shape mismatches if any**

For each locale path reported, open the locale JSON, locate the offending key, and set it to a translated string matching the English value. Preserve indentation and JSON trailing commas (none).

- [ ] **Step 8: Fix the call site if the culprit is (a) or (b)**

Based on the recorded culprit from Step 4:
- If bare `t('settings.workspaces.users', ...)`: change to the correct nested key (e.g. `t('settings.workspaces.users.title', 'Workspace members')`) and add the matching leaf string to every locale JSON.
- If dynamic key: guard the key or list the expected leaf keys and pick the correct one. Do NOT catch and swallow — fix the caller.

- [ ] **Step 9: Re-run the failing test**

Run: `cd services/idun_agent_web && npx vitest run src/components/settings/workspace-users/component.i18n.test.tsx`
Expected: PASS.

- [ ] **Step 10: Visually confirm the bug is gone**

Reload the Settings → Workspace → Users page. Confirm no error string renders.

- [ ] **Step 11: Lint the touched files**

Run: `cd services/idun_agent_web && npm run lint -- --max-warnings=0`
Expected: 0 errors, 0 warnings in changed files.

- [ ] **Step 12: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-users/component.i18n.test.tsx \
        services/idun_agent_web/src/i18n/locales/ \
        services/idun_agent_web/src/components/settings/workspace-users/
git commit -m "fix(web): resolve Workspace Users i18n object/string mismatch"
```

---

## Chunk 2: Close Role-Gating Gaps

Every scoped product page must respect:
- `useProject().canWrite` — gate create/update actions (admin, contributor).
- `useProject().canAdmin` — gate delete and other admin-only actions (admin).
- `useWorkspace().isCurrentWorkspaceOwner` — gate tenant-wide actions (create/delete project, toggle owner flag, invite to workspace).

Where a page already imports `useProject` but doesn't use `canWrite`/`canAdmin`, add the gating. Do not add new contexts — wire what exists.

### Task 3: Gate Integrations page actions

**Files:**
- Modify: `services/idun_agent_web/src/pages/integrations-page/page.tsx`
- Test: `services/idun_agent_web/src/pages/integrations-page/page.test.tsx`

- [ ] **Step 1: Read the current file to map mutation surfaces**

Read `services/idun_agent_web/src/pages/integrations-page/page.tsx` fully. Identify:
- The "Add integration" / "Connect" button(s) and where they are rendered.
- The per-card "Edit" / "Configure" button(s).
- The per-card "Delete" / "Disconnect" button(s) and the `DeleteConfirmModal` render site.

- [ ] **Step 2: Write a failing test for reader view**

Create `services/idun_agent_web/src/pages/integrations-page/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from './page';

vi.mock('../../hooks/use-project', () => ({
  useProject: () => ({
    selectedProjectId: 'p1',
    currentProject: { id: 'p1', name: 'P1' },
    projects: [{ id: 'p1', name: 'P1' }],
    currentRole: 'reader',
    canWrite: false,
    canAdmin: false,
    isLoadingProjects: false,
    refreshProjects: vi.fn(),
  }),
}));
vi.mock('../../services/integrations', () => ({
  fetchIntegrations: vi.fn().mockResolvedValue([]),
  deleteIntegration: vi.fn(),
}));

describe('IntegrationsPage role gating', () => {
  it('hides Connect/Add actions for readers', async () => {
    render(<MemoryRouter><IntegrationsPage /></MemoryRouter>);
    // No create action visible for readers
    expect(screen.queryByRole('button', { name: /connect|add|new/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd services/idun_agent_web && npx vitest run src/pages/integrations-page/page.test.tsx`
Expected: FAIL (reader currently sees the button).

- [ ] **Step 4: Import and use `useProject`**

In `page.tsx`, ensure `canWrite` and `canAdmin` are destructured from `useProject()`. Gate:
- Add/Connect button: render only when `canWrite`.
- Edit/Configure button: render only when `canWrite`.
- Delete button: render only when `canAdmin`.

Use conditional rendering (`{canWrite && <Button .../>}`) rather than the `disabled` prop, to match the pattern used in Memory/MCP/Guardrails pages.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd services/idun_agent_web && npx vitest run src/pages/integrations-page/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add contributor + admin tests**

Extend the test file with:

```tsx
// Contributor: can connect/edit, cannot delete
// Admin: can connect/edit/delete
```

Mirror the reader test, overriding the `useProject` mock's `canWrite`/`canAdmin` values. Assert the presence/absence of the appropriate buttons.

- [ ] **Step 7: Run all tests**

Run: `cd services/idun_agent_web && npx vitest run src/pages/integrations-page/`
Expected: all PASS.

- [ ] **Step 8: Lint**

Run: `cd services/idun_agent_web && npm run lint -- --max-warnings=0 src/pages/integrations-page/`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add services/idun_agent_web/src/pages/integrations-page/
git commit -m "feat(web): gate Integrations page actions by project role"
```

---

### Task 4: Gate SSO page actions

**Files:**
- Modify: `services/idun_agent_web/src/pages/sso-page/page.tsx`
- Test: `services/idun_agent_web/src/pages/sso-page/page.test.tsx`

- [ ] **Step 1: Read the file to map mutation surfaces**

Same mapping as Task 3: Add SSO button, per-card Edit, per-card Delete, `DeleteConfirmModal`.

- [ ] **Step 2: Write failing tests (reader/contributor/admin)**

Create `services/idun_agent_web/src/pages/sso-page/page.test.tsx` following the same template as Task 3, with `useProject` and `../../services/sso` mocks.

- [ ] **Step 3: Run tests, confirm FAIL**

Run: `cd services/idun_agent_web && npx vitest run src/pages/sso-page/page.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Gate the buttons using `canWrite` / `canAdmin`**

- [ ] **Step 5: Run tests, confirm PASS**

Run: `cd services/idun_agent_web && npx vitest run src/pages/sso-page/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `cd services/idun_agent_web && npm run lint -- --max-warnings=0 src/pages/sso-page/`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_web/src/pages/sso-page/
git commit -m "feat(web): gate SSO page actions by project role"
```

---

### Task 5: Gate Agent Dashboard list actions

**Files:**
- Modify: `services/idun_agent_web/src/pages/agent-dashboard/page.tsx`
- Modify (likely): `services/idun_agent_web/src/components/dashboard/agents/agent-card/component.tsx` and `feature-icons.tsx` neighbours
- Test: `services/idun_agent_web/src/pages/agent-dashboard/page.test.tsx`

- [ ] **Step 1: Read the dashboard file to map mutation surfaces**

Identify:
- "Create agent" / "New agent" button.
- Per-card delete affordance (if any — may only exist on detail page).
- Per-card edit / duplicate affordances (if any).

- [ ] **Step 2: Write failing role-gating tests**

Reader: no "Create agent" button; no per-card delete/edit.
Contributor: "Create agent" visible; no per-card delete.
Admin: all actions visible.

- [ ] **Step 3: Run, confirm FAIL**

- [ ] **Step 4: Gate the actions via `canWrite`/`canAdmin`**

If the card renders a delete from a child component, pass gating as a prop from the dashboard page or read `useProject` inside the card (prefer prop drilling to keep context reads localized).

- [ ] **Step 5: Run, confirm PASS**

- [ ] **Step 6: Lint + commit**

```bash
git add services/idun_agent_web/src/pages/agent-dashboard/ \
        services/idun_agent_web/src/components/dashboard/agents/
git commit -m "feat(web): gate Agent Dashboard actions by project role"
```

---

### Task 6: Gate Agent Detail actions (overview + resources + delete)

**Files:**
- Modify: `services/idun_agent_web/src/pages/agent-detail/page.tsx`
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/overview-tab/sections/resources-section.tsx`
- Modify (if present): agent-detail tab edit/delete buttons
- Test: `services/idun_agent_web/src/pages/agent-detail/page.test.tsx` (new if absent)

- [ ] **Step 1: Read the agent-detail entry point and each tab**

Find every place that mutates the agent: name/description edit, resource pick/assign, prompt assign/unassign, delete agent.

- [ ] **Step 2: Write role-gating tests for reader**

Reader should see the tabs read-only: no "Save"/"Edit", resources section shows picked items but no picker, no delete.

- [ ] **Step 3: Run, confirm FAIL**

- [ ] **Step 4: Gate**

- Reader (`!canWrite`): all edit affordances hidden/disabled. Resources section renders a read-only summary of current picks.
- Contributor (`canWrite`): can edit config and assign resources. Cannot delete agent.
- Admin (`canAdmin`): can delete agent.

- [ ] **Step 5: Run, confirm PASS**

- [ ] **Step 6: Lint + commit**

```bash
git add services/idun_agent_web/src/pages/agent-detail/ \
        services/idun_agent_web/src/components/agent-detail/
git commit -m "feat(web): gate Agent Detail editing and resources by project role"
```

---

### Task 7: Audit & gate Workspace Projects tab (owner-only)

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx`
- Modify: `services/idun_agent_web/src/components/settings/workspace-projects/members-panel.tsx`
- Test: `services/idun_agent_web/src/components/settings/workspace-projects/component.test.tsx`

- [ ] **Step 1: Enumerate mutation surfaces**

Read `component.tsx` end-to-end. For each of `handleCreate`, `handleRename`, `handleDelete`, `handleSetDefault`, note where the triggering UI (button/icon) lives.

- [ ] **Step 2: Write failing tests**

Non-owner (`isCurrentWorkspaceOwner === false`): no "Create project" form/button, no delete icon per row, no star/set-default icon per row, no rename affordance.
Owner: all visible.

- [ ] **Step 3: Run, confirm FAIL**

- [ ] **Step 4: Gate**

Use `useWorkspace().isCurrentWorkspaceOwner`. Hide the create form entirely for non-owners (don't just disable — non-owners shouldn't see the input). Hide delete/star/rename affordances per row.

For the Members panel: open-panel action is fine for anyone who belongs to the project, but the panel's internal admin actions should still respect `useProject().canAdmin` (members panel is project-scoped, not workspace-scoped).

- [ ] **Step 5: Run, confirm PASS**

- [ ] **Step 6: Lint + commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-projects/
git commit -m "feat(web): gate Workspace Projects admin actions to owners"
```

---

## Chunk 3: Cross-Project Resource Hygiene & Empty States

### Task 8: Filter resource pickers in Agent Detail by active project

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/overview-tab/sections/resources-section.tsx`
- Reference: `services/idun_agent_web/src/services/{memory,mcp,guardrails,observability,integrations,sso,prompts}.ts`
- Test: `services/idun_agent_web/src/components/agent-detail/tabs/overview-tab/sections/resources-section.test.tsx`

The backend already rejects cross-project resource assignments. The UI today shows all resources in the workspace, inviting failed submits. With `X-Project-Id` already injected on every request in `src/utils/api.ts`, most list endpoints should already return only current-project resources — but verify, because any list endpoint that bypasses project scoping server-side will still leak.

- [ ] **Step 1: For each resource service, confirm list requests are project-scoped**

For each of `services/memory.ts`, `services/mcp.ts`, `services/guardrails.ts`, `services/observability.ts`, `services/integrations.ts`, `services/sso.ts`, `services/prompts.ts`:
- Confirm it uses `apiFetch`/`getJson` so `X-Project-Id` is attached.
- Confirm the backend endpoint filters by project (check against `services/idun_agent_manager/src/app/api/v1/routers/`). If an endpoint doesn't, flag it — do NOT hand-filter on the client.

- [ ] **Step 2: Write a failing test**

The test mounts `resources-section.tsx` with two fetched lists differing by project context, and asserts that on project switch, the picker refetches (mocked) and displays only current-project items.

- [ ] **Step 3: Run, confirm FAIL if refetch-on-project-change isn't wired**

- [ ] **Step 4: Wire refetch-on-project-change**

Add `selectedProjectId` to the effect deps that load resource lists. On project change, clear stale picker state so an agent being edited doesn't accidentally retain pointers to now-invisible resources.

- [ ] **Step 5: Decide on edge case — agent in project A opened while active project is B**

Options:
a) Redirect to project A (auto-switch) when opening an agent whose project != active project.
b) Block: show "This agent belongs to project X. Switch to that project to edit."

Pick (b) to avoid surprising side effects. Add a blocked-state UI inside `agent-detail/page.tsx`.

- [ ] **Step 6: Run, confirm PASS**

- [ ] **Step 7: Lint + commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/ \
        services/idun_agent_web/src/pages/agent-detail/
git commit -m "feat(web): scope agent resource pickers to active project"
```

---

### Task 9: Empty / blocked states for scoped pages

**Files:** all scoped pages under `services/idun_agent_web/src/pages/`:
- `agent-dashboard/page.tsx`
- `prompts-page/page.tsx`
- `memory-page/page.tsx`
- `mcp-page/page.tsx`
- `guardrails-page/page.tsx`
- `observability-page/page.tsx`
- `integrations-page/page.tsx`
- `sso-page/page.tsx`
- Shared: create `services/idun_agent_web/src/components/general/no-project-state/component.tsx` (new)
- i18n: `services/idun_agent_web/src/i18n/locales/*.json`

- [ ] **Step 1: Build a shared `NoProjectState` component**

Renders when `!selectedProjectId`. Shows a clear message ("Select a project to continue" or "You don't have access to any project in this workspace") and — for workspace owners — a "Create project" CTA that links to `Settings → Projects`.

- [ ] **Step 2: Add i18n keys**

Add to each locale file under a new `common.noProject` namespace:
- `title`
- `descriptionNoneAccessible`
- `descriptionNoneSelected`
- `cta`

Translate to all 7 languages.

- [ ] **Step 3: Write a failing test**

For one scoped page (pick `memory-page` as the canonical example), mock `useProject` with `selectedProjectId: null, projects: []` and assert `NoProjectState` renders instead of the page body.

- [ ] **Step 4: Run, confirm FAIL**

- [ ] **Step 5: Wire `NoProjectState` into each scoped page**

Short-circuit the page's main render:
```tsx
const { selectedProjectId } = useProject();
if (!selectedProjectId) return <NoProjectState />;
```
Apply to all 8 scoped pages consistently.

- [ ] **Step 6: Run, confirm PASS and no regressions**

Run: `cd services/idun_agent_web && npx vitest run`
Expected: all PASS.

- [ ] **Step 7: Lint + commit**

```bash
git add services/idun_agent_web/src/components/general/no-project-state/ \
        services/idun_agent_web/src/pages/ \
        services/idun_agent_web/src/i18n/locales/
git commit -m "feat(web): add no-project empty state to scoped pages"
```

---

## Chunk 4: Browser Validation (per role, per flow)

These tasks are manual/browser-driven. For each, record the outcome and filed follow-ups in the session log.

### Task 10: Project member lifecycle walkthrough

**Goal:** Confirm the full create/edit/remove cycle for project members works end-to-end with the correct permissions reflected at each step.

- [ ] **Step 1: Set up two real users (owner + invitee)**

Create User A (workspace owner). Have User B registered separately. Keep both session cookies available (two browsers or one normal + one incognito).

- [ ] **Step 2: As User A, invite User B to a non-default project as `reader`**

Settings → Projects → open project → Members → Invite member. Select User B, role reader. Submit.

- [ ] **Step 3: As User B, confirm scope**

User B should see the workspace and the single project. Scoped pages (agents, prompts, memory, MCP, guardrails, observability, integrations, SSO) should render in reader mode — no create/edit/delete affordances.

- [ ] **Step 4: As User A, promote User B to `contributor`**

User B reloads — contributor affordances (create/edit) now visible, delete still hidden.

- [ ] **Step 5: As User A, promote User B to `admin`**

User B reloads — delete affordances now visible on scoped pages. User B can manage project members.

- [ ] **Step 6: As User A, remove User B**

User B's next request should 401 or 403; frontend should handle it via the session-invalidation path (either hard logout or silent re-auth with reduced scope). Confirm no UI crash.

- [ ] **Step 7: Record results**

File any regressions found as follow-up issues. Do not proceed to Task 11 until all Task-10 blocking bugs are either fixed or filed with owner.

---

### Task 11: Per-role sweep of scoped pages

**Goal:** Confirm every scoped page correctly reflects role in copy, available actions, and API behavior.

For each role in `[reader, contributor, admin]`, on each scoped page (`agents`, `prompts`, `memory`, `mcp`, `guardrails`, `observability`, `integrations`, `sso`), verify:

- [ ] **Step 1: Page copy mentions the active project or its context**

- [ ] **Step 2: Create affordances visible only for contributor+admin**

- [ ] **Step 3: Edit affordances visible only for contributor+admin**

- [ ] **Step 4: Delete affordances visible only for admin**

- [ ] **Step 5: Actions that slip through the UI are rejected by the API cleanly**

Use DevTools to fabricate a forbidden POST/PATCH/DELETE and confirm the backend responds with 403 and the UI surfaces a toast (not a white-screen crash).

Produce a matrix (role × page × affordance) in the session log with ✅/❌ per cell.

---

### Task 12: Workspace owner vs non-owner validation

**Goal:** Tenant administration is gated exclusively to owners.

- [ ] **Step 1: As non-owner, Settings → Workspace → Users**

Invite button must be hidden. Role-change dropdown must be disabled or hidden. Remove button must be hidden.

- [ ] **Step 2: As non-owner, Settings → Projects**

Create form hidden. Delete icon hidden. Star/set-default icon hidden. Rename disabled.

- [ ] **Step 3: As owner on a workspace they own but where they have no project membership**

The owner should still see all projects for administrative purposes (owner is implicitly an admin across projects in their workspace, per spec). Confirm scoped-page behavior matches this.

Record any divergence.

---

### Task 13: Cross-project isolation from the UI

- [ ] **Step 1: Switch projects via the top-navbar selector**

Confirm each scoped page immediately refetches and shows only current-project data. No stale list rendering from the previous project.

- [ ] **Step 2: Open an agent belonging to project A while active project is B**

Per Task 8 decision (b): user should see the "this agent belongs to another project" blocked state with a switch CTA. Verify.

- [ ] **Step 3: Delete the currently selected project (as owner)**

Frontend should fall back to the default project or the first accessible project automatically. Confirm no crash and no scoped page left pointing at a dead project ID.

- [ ] **Step 4: Invite user to project, then revoke project membership while they're active**

Confirm that upon next API call, the user sees a clean session-invalidation and re-scoping. `session_version` bump should trigger.

---

### Task 14: Session invalidation behavior

- [ ] **Step 1: Change a user's role from admin → reader**

As the affected user, confirm `/api/v1/auth/me` returns updated role on next refresh (or via the session-version mechanism). UI should reflect the demotion on next navigation without requiring a hard page reload where possible.

- [ ] **Step 2: Remove a user from the workspace while they're active**

Confirm clean logout behavior and redirect to `/login`, with no unhandled errors.

---

## Chunk 5: Release Prep

### Task 15: Full regression pass

- [ ] **Step 1: Run backend test suite**

Run: `make test` (or: `uv run pytest -q`)
Expected: all PASS. Record coverage delta if measurable.

- [ ] **Step 2: Run frontend unit tests**

Run: `cd services/idun_agent_web && npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Run linters**

Run: `make lint && cd services/idun_agent_web && npm run lint -- --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Type check frontend**

Run: `cd services/idun_agent_web && npx tsc --noEmit`
Expected: 0 errors. If any error appears and it's outside RBAC-touched files, file a separate issue and don't block on it; if it's in RBAC-touched files, fix before merging.

- [ ] **Step 5: Smoke-test golden path in the browser**

Fresh signup → onboarding → create workspace → default project created → navbar shows selectors → create a second project → switch active project → agents/memory/prompts pages reflect active project → invite user as contributor → user's scoped view works.

- [ ] **Step 6: Record results in the session log**

---

### Task 16: Update `services/idun_agent_web/CLAUDE.md` with RBAC section

**Files:**
- Modify: `services/idun_agent_web/CLAUDE.md`

- [ ] **Step 1: Add a new section `## RBAC Model` between `## State Management` and `## Agent Config & Resource Model`**

Cover:
- Two-tier model: workspace ownership (`is_owner`) vs project roles (admin/contributor/reader).
- Where to read role/ownership: `useProject().canWrite`, `useProject().canAdmin`, `useWorkspace().isCurrentWorkspaceOwner`.
- How headers are injected: `src/utils/api.ts` attaches `X-Workspace-Id` and `X-Project-Id` automatically via `apiFetch`.
- Empty-state convention: scoped pages short-circuit to `<NoProjectState />` when `!selectedProjectId`.
- Cross-project policy: resource pickers re-fetch on `selectedProjectId` change; agent detail blocks if agent's project != active project.
- Role-gating convention: conditional render, not `disabled`. Mirror patterns from `memory-page`, `mcp-page`, etc.

- [ ] **Step 2: Update the "Adding New Features / Config Types" checklist**

Add a step: "If the new resource type is project-scoped (it should be), ensure the list endpoint accepts `X-Project-Id` and returns only current-project resources. In the page component, short-circuit to `<NoProjectState />` when no project is selected, and gate actions via `canWrite`/`canAdmin`."

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/CLAUDE.md
git commit -m "docs(web): document RBAC conventions in CLAUDE.md"
```

---

## Execution Notes

**Order of execution:**

1. Do Chunk 1 first — the ops rebuild (Task 1) unblocks anyone working on the frontend, and the i18n fix (Task 2) is small and user-visible.
2. Chunk 2 (gating gaps) can be done in parallel subagents — Tasks 3, 4, 5, 6, 7 are independent files.
3. Chunk 3 (cross-project hygiene + empty states) depends on Chunk 2 being merged, because `NoProjectState` is wired into the same files the gating work touches.
4. Chunk 4 (validation) must run against a deployed stack with the code from Chunks 1–3 live. It is sequential and manual.
5. Chunk 5 (release prep) runs last.

**Commit discipline:** one commit per task end. Do not batch tasks into a single commit; the review loop downstream wants per-task traceability.

**Branch:** stay on `feat/workspace-projects` unless the current branch is already in a mergeable state; if so, cut `feat/workspace-project-rbac-completion` off `main` and rebase.

**Skills to use while executing:**
- @superpowers:test-driven-development for Chunks 1–3.
- @superpowers:systematic-debugging if Task 2 diagnosis is non-obvious.
- @superpowers:verification-before-completion before claiming any task done.
- @superpowers:requesting-code-review at the end of each chunk.
