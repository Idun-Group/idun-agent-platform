# Residual Gap Fixes — Validation Report

**Date:** 2026-04-16
**Stack:** `docker-compose.dev.yml` at branch `feat/workspace-projects`
**Evidence:** `gaps-1-to-4-validation.gif`

All 4 residual gaps from the earlier RBAC completion report are now **fixed and runtime-verified**.

## Gap 1 — Reader-aware empty-state copy ✅

**Problem:** Reader users saw writer-flavored copy on empty scoped pages ("Create your first agent in Beta to start monitoring…"). Misleading because readers can't create.

**Fix (commit `c92df349`):** Added `scopedEmpty.<page>.readerTitle` / `readerDescription` i18n keys in all 7 locales (`en/fr/de/es/it/pt/ru`). 7 scoped pages conditionally render the reader variant when `!canWrite`. Contributor/admin see the existing writer-flavored copy. 13 new unit tests, 110/110 pass.

**Runtime verification (screenshot captured):**
- As reader on `/memory`: Title **"No memory stores in Beta yet"**, description **"Ask a contributor or admin to configure one."** (was "Configure a memory store to get started" with long writer-flavored explanation).

## Gap 2 — Clear `default_workspace_id` on membership delete ✅

**Problem:** Deleting a user's workspace membership did not null their `default_workspace_id`. The column continued pointing at an inaccessible workspace. Harmless (frontend routes to `/onboarding` based on `workspace_ids.length === 0`) but untidy.

**Fix (commit `2731fcb1`):** After `session.flush()` in `remove_member`, re-fetch the target user and null `default_workspace_id` if it matched the deleted workspace. 3 new integration test scenarios — only-membership, default-matches-deleted, default-elsewhere. All pass. Full manager suite `173/173` green.

**Runtime verification:** After deleting User B's workspace membership via API, `GET /api/v1/auth/me` as User B returns `{"defaultWorkspaceId": null, "workspaceIds": []}`. Confirmed. Navigation then routes B to `/onboarding` with a clean "Create your workspace" form.

## Gap 3 — Agent-from-other-project friendly error state ✅

**Problem:** Backend returns 404 on `GET /agents/{id}` when `X-Project-Id` scopes to a project where the agent doesn't live. Frontend showed raw JSON: "Failed to load agent / {"detail":"Agent with id … not found"}". The original `<CrossProjectBlockedState />` branch was never triggered because the backend filters before the agent object reaches the frontend.

**Fix (commit `3a514964`):** When the agent load fails with a 404-like error, render a styled empty state that matches the existing cross-project blocked UI: folder-lock icon, title "Agent not available here", description "This agent isn't available in {project}. It may belong to another project, or it may have been deleted.", and a "Back to agents" CTA. i18n keys added for all 7 locales.

**Runtime verification (screenshot captured):** As User B (member of Beta only), navigating to `/agents/{id-from-default-project}` renders the new friendly state — no raw JSON, clear affordance to return.

## Gap 4 — Session version / role-change propagation ✅

**Problem:** Not previously runtime-verified: does the frontend pick up a server-side role change without a hard reload?

**Test:**
1. User B is logged into the browser as `reader` on project Beta (badge reads `reader`, no create affordances visible).
2. From a separate shell, User A (owner) promotes B to `admin` via `PATCH /api/v1/projects/{beta}/members/{b-membership-id}` with body `{"role":"admin"}`. This happens while B's browser session is idle but not closed.
3. User B navigates from one internal route to another (via `<Link />`, SPA routing).

**Result:** On the next render, B's navbar badge updates to `admin` and the Memory page swaps from the reader empty state ("No memory stores in Beta yet — ask a contributor or admin to configure one.") to the writer empty state ("Configure a memory store to get started"). No hard reload required — the frontend's `/me` re-query during navigation (plus the `session_version` cookie re-sign) picks up the change automatically.

**This confirms the `session_version` mechanism works end-to-end at runtime.**

---

## Summary of new commits (post-Task-16)

| Commit | Change |
|---|---|
| `c92df349` | `fix(web): reader-aware empty-state copy on scoped pages` — Gap 1 |
| `2731fcb1` | `fix(manager): clear default_workspace_id when membership deleted` — Gap 2 |
| `3a514964` | `fix(web): friendly error state when agent is not in the active project` — Gap 3 |

Branch `feat/workspace-projects` is now **29 commits ahead of `origin/develop`**. All original 16 plan tasks + 4 gap fixes delivered. Test posture: backend `173/173`, web `110/110`, `tsc --noEmit` exit 0.

## What's left for the human reviewer

The branch is ready for review and merge. Suggested order of verification:
1. Read the test matrix at `docs/superpowers/validation/2026-04-16-rbac/test-matrix.md`.
2. Spot-check this report's screenshots in `gaps-1-to-4-validation.gif`.
3. Optionally replay the role-walk scenario against a fresh stack.
4. Open PR against `develop`.
