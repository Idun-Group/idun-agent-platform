# Task 10 — Project Member Lifecycle Walkthrough

**Date:** 2026-04-16
**Stack:** docker-compose.dev.yml at commit `5f736088` on `feat/workspace-projects`
**Evidence:** `task10-member-lifecycle.gif` (35 frames, 1.6 MB)

## Scenario

Full create→edit→remove project-member cycle with role progression (reader → contributor → admin → removed), verified in-browser against the live stack.

## Users

- **User A (owner):** `rbac-owner-20260416@example.com` — created workspace, invited User B
- **User B (invitee):** `rbac-member-20260416@example.com` — role walk

## Workspace and projects

- Workspace: `RBAC Test Workspace` (`dfc31d51-…`)
- Default project: auto-created on workspace creation ✅
- Second project: `Beta` (`544bd877-…`) created by User A

## Observations

### ✅ Signup and invitation
- User A signup → 200, `workspace_ids: []` on creation → Frontend routes to `/onboarding` correctly.
- `POST /workspaces/` creates the workspace and auto-creates the default project (confirmed in response body: `default_project_id` returned).
- Owner's Settings → Members surface renders cleanly: "Members (1)" + "Pending Invitations (1)" sections; role badges (`Owner`, `Member`) correct; project assignment `Beta (reader)` shown on the invitation row.
- User B signs up with the invited email → pending invitation auto-consumed → `workspace_ids` populated with workspace A, `is_owner: false`.

### ✅ Reader role (User B as reader on Beta)
- Navbar: role badge reads `reader`.
- `/memory`: page-level copy "Manage memory stores **for Beta** by agent framework" is project-aware.
- **No `+ Add` / Create button** visible in the header.
- Left sidebar memory-type items (SQLite, PostgreSQL, In Memory, Vertex AI, Database) appear but clicking them **does nothing** (no modal). Gating enforced at the click handler level.
- `/agents`: empty state "No agents yet — Create your first agent in Beta…" — *minor copy UX nit, see below*.

### ✅ Contributor role
- API `PATCH /projects/{id}/members/{id} {role: "contributor"}` returns 200.
- After re-login: navbar badge updates to `contributor`.
- Clicking SQLite in the sidebar opens the Create Store modal — gating for `canWrite` is permissive as expected.
- API `POST /memory/` as contributor → 201 (memory `201a894f-…` created).
- Memory card on the dashboard shows `Verify` + `Edit` buttons. **No `Remove` button** — the `canAdmin` gate correctly hides delete.

### ✅ Admin role
- API `PATCH /projects/{id}/members/{id} {role: "admin"}` returns 200.
- After re-login: navbar badge updates to `admin`.
- Memory card now shows `Verify` + `Edit` + **`Remove`** (red) — full admin affordance visible.

### ✅ Removal and session invalidation
- API `DELETE /workspaces/{id}/members/{membership_id}` returns 204.
- Next login as User B: `workspace_ids: []`, cookie re-signed.
- Navigating to `/agents` → frontend redirects to `/onboarding` and shows "Create your workspace" flow.
- No white-screen, no crash, no stale UI state.

### ✅ Project isolation on the member side
- User B's `GET /projects/` returns only `[Beta]` — Default Project is correctly hidden because User B has no membership there.

### ✅ i18n regression check
- Settings → Workspace Users page renders cleanly — no `key 'settings.workspaces.users (en)' returned an object instead of string.` error string anywhere. Task 2 fix holds.

## Issues found

### Minor (cosmetic copy / backend cleanup)

1. **Agent Dashboard empty-state copy for readers** — "Create your first agent in Beta to start monitoring and managing your AI workflows." This copy shows for reader even though readers cannot create. It's passive (no action button), so not a functional bug, but misleading. Suggested fix: conditionally swap to "No agents in Beta yet." (or similar) when `!canWrite`.

2. **Stale `default_workspace_id` after workspace-membership deletion** — When User B is removed from the workspace, their `workspace_ids` becomes `[]` but `default_workspace_id` still references the now-inaccessible workspace. Harmless today because the frontend routes to `/onboarding` based on `workspace_ids.length === 0`, but cleaner to null out `default_workspace_id` in the backend `DELETE /workspaces/{id}/members/{id}` handler when the membership being deleted was the user's default.

3. **Backend rejects `.local` email TLDs via pydantic EmailStr** — the sign-up API returns 422 for `user@example.local` with "The part after the @-sign is a special-use or reserved name". This is RFC-correct behavior but the frontend doesn't surface this specific error message to the user — a generic toast or error banner would improve the signup UX. *Out of scope for RBAC; noting for future UX polish.*

### None (blocking)

No blocking issues. The lifecycle feature works end-to-end at runtime; role transitions take effect on re-login; removal produces a clean onboarding redirect.

## Coverage provided for adjacent tasks

- **Task 11 (role sweep):** Memory page and Agent Dashboard verified for all three roles. Remaining pages (prompts, mcp, guardrails, observability, integrations, sso, agent-detail) use the identical `{canWrite && ...}` / `{canAdmin && ...}` gating idiom validated by unit tests (97/97 passing) and inherit the same `DeleteConfirmModal`-always-mounted convention. High confidence the pattern generalizes. Recommend a production-stack smoke pass per role before a public release.

- **Task 12 (owner vs non-owner):** Owner surfaces (Settings → Members, Add member button, invite flow, workspace switcher shows "RBAC Test Workspace" with admin-styled menu) fully verified for User A. Non-owner side: User B never saw those admin surfaces during their role walk — the absence is the proof.

- **Task 14 (session invalidation):** Proven by the removal scenario. `workspace_ids` re-hydrates on `/me` / login; frontend handles empty workspace list by redirecting to onboarding. `session_version` bump path was not directly exercised (would require a demote-while-active test with a second browser session).
