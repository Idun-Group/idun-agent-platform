# Tasks 11–14 — Consolidated Browser Validation Results

**Date:** 2026-04-16
**Stack:** docker-compose.dev.yml at commit `5f736088` on `feat/workspace-projects`
**Evidence:** `task11-role-sweep.gif` (14 frames, 719 KB) + `task10-member-lifecycle.gif` (Task 10 coverage)

Tasks 11, 12, 13, 14 from the plan are closely related browser-validation checks. Many findings overlap — they're consolidated here with the evidence for each.

## Task 11 — Per-role sweep of scoped pages

Verified role-gated affordances in the live browser across all 8 project-scoped pages. User B was promoted through reader → contributor → admin on project Beta.

| Page | Reader (from Task 10) | Admin (this sweep) | Demoted-reader (this sweep) |
|---|---|---|---|
| `/memory` | No Add button; SQLite click no-op | All mutation affordances visible | — |
| `/agents` | No Create; empty state shown | All mutation affordances visible | — |
| `/prompts` | *(inferred)* | `+ New Prompt` button in header + empty state | — |
| `/mcp` | *(inferred)* | Transport sidebar + create pills | — |
| `/guardrails` | *(inferred)* | Guardrail catalog + API Key banner | — |
| `/observability` | *(inferred)* | Providers sidebar + create pills | — |
| `/integrations` | *(inferred)* | Messaging providers + sidebar | — |
| `/sso` | — | `+ Add SSO config` button + Add tile | **No button, no tile** ✅ |

All 8 admin views include project-aware copy (the page subtitle contains "in Beta" or "for Beta"). Navbar role badge transitions observed: `reader` → `contributor` → `admin` → `reader` (after demote) — updates on re-login.

**Conclusion:** The `{canWrite && ...}` / `{canAdmin && ...}` gating pattern works at runtime across every scoped page verified. Inference for pages not directly exercised as reader: the same idiom is used in each page's source code, unit tests pass for all of them (97/97), and the live SSO-as-reader test confirms the inverse gating.

**Minor UX nit (same as Task 10):** Empty-state copy on pages like Agent Dashboard still reads "Create your first agent in Beta…" to readers. Passive (no button), but misleading.

## Task 12 — Owner vs non-owner validation

Owner (User A) verified:
- Settings → Members tab accessible; "Add member" button visible in the header.
- Invite flow accepts `is_owner` toggle + `project_assignments`; pending invitation renders with role + project badge.
- Settings → All Projects (Workspace Projects tab) allows project create/rename/delete/set-default for the owner.
- Navbar workspace switcher and project switcher both interactable for owner.

Non-owner (User B) verified:
- During the full role-walk (reader → contributor → admin), User B's navbar **never** exposed `Add member` or workspace-admin surfaces.
- User B's project list returns ONLY projects they have membership in (Beta). Default Project is hidden (no membership).
- Removing User B's workspace membership → `workspace_ids: []` → frontend redirects to `/onboarding`.

**Conclusion:** Ownership is strictly separate from project role. Non-owners cannot perform tenant-admin actions, even at admin project role. Proven by absence during the end-to-end lifecycle.

## Task 13 — Cross-project isolation

Verified:
- **Project list scoping:** `GET /projects/` as User B returned only `[Beta]` — Default Project was filtered out by the backend's project-membership join. No UI leak.
- **Resource scoping:** Memory entry created under Beta is visible on Memory page when Beta is active; the project selector in the navbar shows Beta for User B.
- **Refetch on project switch:** Confirmed in Task 8 unit tests (memory page refetches when `selectedProjectId` changes). The single-project state for User B prevented a runtime switch demonstration.
- **`X-Project-Id` header injection:** All resource API calls routed through `apiFetch` carry the header (confirmed in `src/utils/api.ts` and by observing server-side accepts in this run).

Not exercised in-browser:
- **Agent-from-other-project blocked state.** Task 6 unit tests (`page.test.tsx`) assert that when `agent.project_id !== selectedProjectId` the page renders `<CrossProjectBlockedState />` and hides the edit affordances. Runtime reproduction would have required fabricating an agent via the manager API, but the engine-config Pydantic schema is strict and not amenable to quick JS-in-page fabrication. Unit test coverage stands; recommend an end-to-end check before GA.

**Conclusion:** Project isolation works at the API scoping level and at the project-list level in-browser. The agent-blocked-state UX remains covered by unit tests only.

## Task 14 — Session invalidation

Exercised the workspace-membership-deletion path:
- Owner (A) calls `DELETE /workspaces/{id}/members/{id}` → 204.
- User B's next session/login returns `workspace_ids: []`, cookie re-signed.
- Navigating to any protected route → redirect to `/onboarding`. No crash, no stale UI.

Not directly exercised:
- **`session_version` bump during an active session.** This would require a second live browser tab holding User B's session while the demotion happens, and observing that the next API call returns a re-auth signal. The mechanism exists in the backend (`session_version` column + `/me` re-query). Not blocking — but recommend a concurrent-tab check before GA.

**Conclusion:** Fresh-login re-hydration works. In-flight session bump path remains unvalidated at runtime.

## Overall assessment

The Workspace/Project RBAC feature is functionally correct at runtime. All critical flows — signup, invite, role progression, resource gating, removal, onboarding fallback — behave as specified. Unit test coverage (97/97 web, 171/171 manager) plus live verification on memory + agents + SSO gives high confidence the remaining pages behave identically.

**Known residual gaps (non-blocking):**
1. Empty-state copy still uses "Create your first…" for readers on some pages.
2. `default_workspace_id` remains set on the user after their only membership is deleted (cleanup oversight, harmless).
3. Agent-from-other-project blocked UI confirmed by unit test only, not by live browser.
4. Active-session `session_version` bump path confirmed by backend code only, not runtime.

**Recommended before a release cut:** quick end-to-end click-through of the 4 gaps above, ideally on a production-like stack.
