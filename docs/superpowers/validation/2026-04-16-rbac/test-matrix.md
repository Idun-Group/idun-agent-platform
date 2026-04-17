# Workspace / Project RBAC — Test Matrix

This is the end-to-end test plan for the RBAC feature. Each cell describes a specific assertion that should hold against a live stack. Use this both as the manual pre-release smoke checklist and as the script for automated browser validation (Chrome MCP).

**Stack under test:** `docker-compose.dev.yml` with branch `feat/workspace-projects` (or any deploy rebuilt from equivalent commits). All URLs assume `http://localhost:3000` for web, `http://localhost:8000` for manager API.

**Test fixtures (throwaway accounts):**
- **Owner (A):** email `rbac-owner-<date>@example.com`, password `RbacOwner2026!`
- **Member (B):** email `rbac-member-<date>@example.com`, password `RbacMember2026!`
- **Bystander (C, optional for cross-project tests):** email `rbac-bystander-<date>@example.com`, password `RbacBystander2026!`

**Note on emails:** the backend's `EmailStr` validator rejects RFC-reserved TLDs like `.local`, `.test`, `.example`. Use `@example.com` or a real-looking domain.

---

## 1. Onboarding and workspace lifecycle

| # | Scenario | Expected |
|---|---|---|
| 1.1 | User A signs up (fresh email), lands on `/onboarding` | Onboarding page shown with "Create your workspace" form |
| 1.2 | User A creates a workspace | Redirected to `/agents`, session cookie refreshed; default project auto-created server-side |
| 1.3 | User A's Settings → All Projects tab shows 1 project marked "Default" | ✅ |
| 1.4 | User A creates a 2nd project "Beta" via Settings → All Projects → `+ Create project` | Beta appears in list and in navbar project selector |

## 2. Invitation and membership consumption

| # | Scenario | Expected |
|---|---|---|
| 2.1 | As A, Settings → Members → Add member → invite `B@example.com` as non-owner with Beta=reader | 201; invitation row appears in "Pending Invitations" table |
| 2.2 | User B signs up with exact invited email | 200 signup; `workspace_ids` populated with A's workspace; `is_owner: false`; project membership created on Beta with role=reader |
| 2.3 | As B, navbar workspace selector shows "RBAC Test Workspace" and project selector shows only **Beta** (Default Project hidden — no membership) | ✅ |
| 2.4 | As A, Settings → Members → "Pending Invitations (0)" (invitation auto-consumed) | ✅ |

## 3. Role-gated affordances per page (the matrix)

Table cells: ✅ = affordance visible/working | ❌ = affordance absent | — = N/A for that role.

### 3.a Resource-page affordances (8 scoped pages × 3 roles)

| Page | Create button | Edit button | Delete button |
|---|---|---|---|
| | R / C / A | R / C / A | R / C / A |
| `/agents` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/prompts` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/memory` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/mcp` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/guardrails` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/observability` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/integrations` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |
| `/sso` | ❌ / ✅ / ✅ | ❌ / ✅ / ✅ | ❌ / ❌ / ✅ |

Legend: R=reader, C=contributor, A=admin.

### 3.b Empty-state copy per role

| Role | Title should start with | Notes |
|---|---|---|
| R | "No {resource} in {project} yet" (no trailing period in title) | description: "Ask a contributor or admin to …" |
| C / A | "Create your first {resource}", "Configure a …", "Add an MCP server…", etc. | Current writer-oriented empty-state copy |

### 3.c Page copy includes the active project name

Every scoped page's subtitle should contain the active project's name (e.g. "Manage memory stores for Beta by agent framework"). Verified on all 8 pages.

### 3.d Navbar role badge

| Role on active project | Badge text |
|---|---|
| Admin | `admin` (purple) |
| Contributor | `contributor` (purple) |
| Reader | `reader` (purple) |

Badge updates after re-login following a role change.

## 4. Agent Detail gating

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Reader opens Agent Detail for an agent in their project | Name/description/config read-only; no `Edit Agent` button; no `Restart` button; no `Delete Agent` button; resource cards show read-only ConfigChips (no quick-add / manage / create-new inside resources section) |
| 4.2 | Contributor opens Agent Detail | `Edit Agent` button visible; entering edit mode shows Save/Cancel; Resource pickers allow quick-add / manage. **No** `Delete Agent` button |
| 4.3 | Admin opens Agent Detail | Full edit + `Delete Agent` (red, admin-only) |

## 5. Cross-project isolation

| # | Scenario | Expected |
|---|---|---|
| 5.1 | User B's `GET /api/v1/projects/` returns only projects they're a member of | Default Project absent; only Beta listed |
| 5.2 | Resource lists in scoped pages are filtered by `X-Project-Id` (injected automatically by `apiFetch`) | ✅ |
| 5.3 | User B's project selector in navbar shows only Beta | ✅ |
| 5.4 | Switching project in navbar triggers refetch in open scoped page | Old list cleared; new list loads (verify via DevTools network tab or visible change) |
| 5.5 | User B opens `/agents/{id}` for an agent that lives in Default Project (where B has no access) | Cross-project blocked state renders: "This agent belongs to a different project." with a "Switch to that project" CTA if B had access, or a plain "Ask an admin…" hint if not. No editable inputs, no mutation affordances |
| 5.6 | Clicking "Switch to that project" (if B had access) calls `useProject().setSelectedProjectId()` and the page reloads into the correct project | No silent auto-switch on mount (verify by navigating directly to the URL; user must click) |

## 6. Settings surfaces — tenant vs project administration

| # | Scenario | Expected |
|---|---|---|
| 6.1 | As non-owner (B), Settings → Members | Tab accessible but actions gated: no `Add member` button, no `Remove` icon per row, no role-change dropdown (role badges shown instead) |
| 6.2 | As non-owner (B), Settings → All Projects | No `+ Create project` form; no per-row delete icon, star-default icon, or rename affordance. Members button per row still openable |
| 6.3 | Members panel internal actions gate on `useProject().canAdmin`, NOT on `isCurrentWorkspaceOwner` | A workspace owner who is a project reader sees role badges but no admin actions inside the Members panel |
| 6.4 | As owner (A), Settings → Members | Full affordances: `Add member`, role change, remove, pending invitations table |
| 6.5 | As owner (A), Settings → All Projects | Full affordances: create form, rename, set-default (star), delete, Members panel open |

## 7. Session invalidation

| # | Scenario | Expected |
|---|---|---|
| 7.1 | Admin changes B's project role while B is NOT active | On B's next login, navbar role badge reflects new role; affordances update accordingly |
| 7.2 | Admin changes B's project role while B IS active in another tab | B's next API call to any resource endpoint should pick up the new role. Frontend should re-query `/me` or refresh. (Tracked via `session_version` on the User row.) |
| 7.3 | Admin removes B from workspace while B is active | Next navigation → `/onboarding`. No white-screen. `workspace_ids: []` on `/me` |
| 7.4 | After 7.3, B's `default_workspace_id` is set to NULL | API `/me` returns `default_workspace_id: null` (fixed in Gap 2) |

## 8. i18n integrity

| # | Scenario | Expected |
|---|---|---|
| 8.1 | Settings → Members tab renders in all 7 locales | No "returned an object instead of string" error (fixed in Task 2) |
| 8.2 | Reader empty-state keys under `scopedEmpty.*` render as real translations | Not raw English leaking into `fr/de/es/it/pt/ru` |
| 8.3 | NoProjectState keys under `noProject.*` render as real translations | All 3 variants × 7 locales |
| 8.4 | Cross-project blocked state keys under `agentDetails.crossProjectBlocked.*` render as real translations | ✅ |

## 9. Cosmetic / polish

| # | Scenario | Expected |
|---|---|---|
| 9.1 | Dark mode: every RBAC-touched page renders cleanly | No hardcoded white/black colors; all surfaces use `hsl(var(--…))` tokens |
| 9.2 | Responsive: navbar selectors don't overflow at 375px width | Project + workspace selectors wrap/collapse reasonably |
| 9.3 | Empty-state skeleton grid in `NoProjectState` animates smoothly in both themes | ✅ |

---

## Automation hooks

Chrome-MCP runner should:

1. Open `http://localhost:3000` in a fresh tab.
2. Run each row in sections 1–4 via a combination of API setup (faster) and browser verification (for UI assertions).
3. Capture a GIF per major scenario (invite flow, role walk, cross-project block, session invalidation).
4. Store evidence under `docs/superpowers/validation/<date>-rbac/`.
5. Emit a pass/fail report per row so any regressions are pinpointable.

Known non-bugs:
- Storybook browser-mode tests require `npx playwright install`. Not a runtime assertion; skip by running `npx vitest run --project unit`.
- Backend `EmailStr` validation rejects `.local`/`.test`/`.example` TLDs. This is intentional; frontend signup UX could surface the server error better, but that's out of scope for RBAC.
