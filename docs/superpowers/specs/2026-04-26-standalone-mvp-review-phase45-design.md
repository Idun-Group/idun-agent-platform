# Standalone MVP Review — Phase 4 + 5 Design Spec

**Goal:** Close the docs alignment gaps (Phase 4) and the polish/cleanup items (Phase 5) from the 2026-04-26 review so the OSS product narrative is coherent and the codebase has no dangling drift.

**Source review:** `docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md` — §"Documentation Findings" + §"UI/UX Gaps" remainders.

**Phase 1 + 2 + 3 prerequisites:** committed and pushed (110 backend tests + 35 Vitest + 14 Playwright).

---

## Phase 4 deliverables (docs)

### 4.1 Glossary (Engine / Standalone / Manager / Web UI)

**Problem:** The term "standalone" is overloaded. Public docs use it for both engine-only mode (`idun agent serve`, no UI, no DB) and the new product (`idun-standalone serve`, embedded UI + admin REST + DB).

**Fix:** New page `docs/glossary.mdx` defining the four products. Add to `docs.json` navigation under a top-level "Concepts" or "About" group (or wherever the structure makes most sense — read the existing `docs.json` first).

Definitions (verify each against actual code/CLAUDE.md before writing):
- **Engine** (`idun-agent-engine`) — Python SDK + FastAPI runtime that wraps a LangGraph or ADK agent into a production endpoint. Single binary `idun agent serve`. No DB, no UI, no admin.
- **Standalone** (`idun-agent-standalone`) — single-process product wrapping the engine with embedded chat UI, admin REST surface, traces capture, local DB-backed persistence, password auth, and Cloud Run/Docker deployment. Single binary `idun-standalone serve`.
- **Manager** (`idun-agent-manager`) — multi-tenant control plane API for managing fleets of agents, workspaces, RBAC, OIDC, policies, and shared resources. Postgres-backed. Pairs with the Web UI.
- **Web UI** (`idun-agent-web`) — React 19 admin dashboard for the Manager.

Also clarify **two install paths** for users:
- `pip install idun-agent-engine` + `idun agent serve --config <yaml>` → engine-only
- `pip install idun-agent-standalone` + `idun-standalone init scratch && cd scratch && idun-standalone serve` → standalone product

### 4.2 FAQ split — engine-only vs standalone product

**Problem:** `docs/faq.mdx` blends both concepts. A user reading "no DB required" doesn't know which path that applies to.

**Fix:** Update each ambiguous FAQ to specify the path:
- "Does Idun require a database?" → "**Engine-only**: no. **Standalone**: yes (SQLite by default; Postgres optional). **Manager**: Postgres required."
- "How does authentication work?" → split per product.
- Quickstart confusion: the front-page "CLI" tab needs an explicit toggle between the two paths OR a clear "you probably want this one" recommendation pointing at standalone.

Don't rewrite the whole FAQ — surgically clarify the questions that conflate the two products.

### 4.3 CONTRIBUTING.md update for standalone workflow

**Problem:** `/CONTRIBUTING.md` has 53 lines covering general workflow but no mention of standalone wheel/UI build/test loop.

**Fix:** Add a section "Working on idun-agent-standalone" with:
- How to run the standalone backend tests locally (`uv run pytest libs/idun_agent_standalone/tests`).
- How to build the UI (`cd services/idun_agent_standalone_ui && pnpm install && pnpm build`).
- How to run UI tests (`pnpm typecheck && pnpm test`).
- How to run E2E (`pnpm test:e2e` — uses Playwright `webServer` from P1.5).
- How to build the wheel (`make build-standalone-wheel`).
- How to run the clean-venv install smoke (`scripts/wheel-install-smoke.sh`).
- How to launch a dev standalone with the echo agent (point at the boot script or give a one-liner).

### 4.4 Release smoke checklist

**Problem:** Review §"Recommended Docs Fixes" calls for a release smoke checklist so cuts don't slip on the OSS install path.

**Fix:** New file `docs/superpowers/release-smoke-checklist.md` (internal — not in the Mintlify site since it's process, not user-facing). Items:
- `make ci` (lint + mypy + pytest) green
- Standalone `uv run pytest libs/idun_agent_standalone/tests -q` ≥ 110
- Frontend `pnpm typecheck && pnpm test && pnpm build` clean
- `pnpm test:e2e` 14/14
- `scripts/wheel-install-smoke.sh` PASS
- Docker image build succeeds locally
- Manual checks: `/health`, login, send one chat, see one trace, edit one admin config + reload

### 4.5 README softening

**Problem:** Review flags overclaims on the comparison table: "no lock-in", "low maintenance", broad SSO/RBAC. Soften to match what's actually shipped (LangGraph + ADK today; LangChain "in scope but not first-class"; OIDC reserved but not implemented).

**Fix:** Edit `README.md` and the corresponding section in `docs/index.mdx` if it mirrors the comparison.

- Remove or footnote "no lock-in" (since the engine couples to LangGraph/ADK adapters).
- Remove "low maintenance" or qualify it (it's a self-hosted product; maintenance is whatever the operator does).
- Adjust SSO/RBAC claims: SSO is via OIDC at the Manager level; the standalone product has password auth only today.
- LangChain: re-word from "first-class" to something like "compatible — LangGraph and ADK are first-class today".

### 4.6 Mark phase specs as `Status: shipped`

**Problem:** Internal design specs are still marked as draft, which can undercut confidence if linked externally.

**Fix:** Add a `Status: Shipped` line at the top of:
- `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`
- `docs/superpowers/specs/2026-04-26-ui-redesign-editorial-shadcn-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase1-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase2-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase3-design.md`

(Phase 4+5 will be marked shipped after this work lands.)

### 4.7 Public roadmap language

**Problem:** Review flags vague positioning around LangChain/MCP/observability priorities.

**Fix:** Either (a) add a `docs/roadmap.mdx` page with "Today / Next / Later" buckets, OR (b) extend an existing positioning page with a roadmap section. Use whichever lands cleanest.

Roadmap content (high-level only — no dates):
- **Today:** LangGraph + ADK adapters, password auth, SQLite/Postgres persistence, Langfuse/Phoenix/LangSmith observability, MCP toolchain, Cloud Run deploy.
- **Next:** OIDC for Manager, fleet metrics + log streaming, hub import for community templates, broader LangChain story.
- **Later:** Multi-region deploys, native A/B test harness, marketplace for agents.

Adjust to match anything explicitly committed to elsewhere; don't promise things.

---

## Phase 5 deliverables (polish/cleanup)

### 5.1 Legacy `--color-*` token sweep on remaining admin components

**Problem:** P3.1 fixed login but the same drift remains in 4 admin components flagged by the subagent: `SingletonEditor`, `YamlEditor`, `AuthGuard`, `SaveToolbar`.

**Fix:** Replace every `--color-bg / --color-fg / --color-muted / --color-border / --color-accent` reference in those 4 files with the shadcn semantic equivalent or the Tailwind utility (`bg-background`, `text-foreground`, etc.). Same playbook as P3.1.

**Acceptance:** `grep -rn "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/components/admin/` returns no matches.

### 5.2 `.shimmer` keyframe cleanup

**Problem:** `.shimmer` class + `@keyframes shimmer` defined in `app/globals.css` are unused after P3.8 swapped HistorySidebar to `<Skeleton>`.

**Fix:** Verify no other consumer (`grep -rn "shimmer" services/`); if unused, remove the keyframe + class.

### 5.3 Wheel content inspection in CI

**Problem:** P1.2 ensured `alembic.ini` ends up in the wheel via `force-include`. There's no automated check that future changes don't regress.

**Fix:** Extend the wheel-install smoke (or add a separate CI step) that runs `unzip -l dist/idun_agent_standalone-*.whl` and asserts:
- `idun_agent_standalone/alembic.ini` present
- `idun_agent_standalone/db/migrations/` directory present
- `idun_agent_standalone/static/` present (the bundled UI)
- `idun_agent_standalone/static/index.html` present

Implement as a small assertion in `scripts/wheel-install-smoke.sh` or a sibling `scripts/wheel-content-check.sh`.

### 5.4 Drop docs `.shimmer` references if any

**Problem:** Sweep for any remaining doc/example that references the old `.shimmer` class.

**Fix:** `grep -rn "shimmer" services/idun_agent_standalone_ui/` and remove anything orphaned.

---

## 3. Architecture decisions

**D1: Glossary lives in the user-facing docs.** It's a positioning aid for readers choosing a path. Internal-only items (release checklist, status markers) live in `docs/superpowers/`.

**D2: README softening is surgical.** Don't rewrite the whole readme; just qualify the claims the review flagged.

**D3: Phase status markers are at the top of each spec.** Format: `**Status:** Shipped — YYYY-MM-DD` near the title.

**D4: Token sweep covers admin only in Phase 5.** Other untouched files (e.g., the chat layouts) already use semantic tokens after the redesign. Stop there.

**D5: Wheel content check runs after the install smoke.** Same script, extra assertions.

---

## 4. Verification

### Phase 4

```bash
# Mintlify build (if available locally — not strictly required for CI)
# Otherwise spot-check: open the rendered MDX in your editor / browser

# Spec status markers updated:
grep -l "Status:" docs/superpowers/specs/*.md
```

No automated test — Phase 4 is pure documentation.

### Phase 5

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
grep -rn "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/components/admin/
# Should return 0 matches.

grep -rn "shimmer" services/idun_agent_standalone_ui/
# Should return 0 matches (or only in test files describing semantic concept).

bash scripts/wheel-install-smoke.sh
# Should still PASS, with the new content assertions also passing.

# Frontend hygiene:
cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm test && pnpm build
# All green.
```

---

## 5. Acceptance criteria

- All 7 Phase 4 docs deliverables landed.
- All 4 Phase 5 cleanup deliverables landed.
- No legacy `--color-*` tokens in `components/admin/`.
- No `.shimmer` references anywhere in `services/idun_agent_standalone_ui/`.
- Wheel content assertions pass in the install smoke.
- All previously green tests stay green (110 backend, 35 Vitest, 14 E2E).
