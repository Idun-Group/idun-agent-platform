# Standalone MVP Review — Phase 4 + 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Resolve the 7 Phase 4 docs items + 4 Phase 5 cleanup items per `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase45-design.md`.

**Architecture:** Two batched subagent dispatches:
- **Batch P4 — Docs sweep** (4.1 → 4.7): one subagent does all docs work since the items are correlated and small.
- **Batch P5 — Polish** (5.1 → 5.4): one subagent does all cleanup since the items are quick and lint-driven.

---

## Batch P4 — Docs sweep

### Task P4.1 — Glossary

**File:** `docs/glossary.mdx` (new)

Frontmatter (per docs CLAUDE.md):
```yaml
---
title: "Glossary"
description: "Definitions of Idun's products: Engine, Standalone, Manager, and Web UI — and which install path to choose."
keywords: ["glossary", "engine", "standalone", "manager", "web ui", "install path"]
---
```

Body: 4 product definitions + 2 install path examples per spec §4.1.

Verify each definition against:
- `libs/idun_agent_engine/CLAUDE.md`
- `libs/idun_agent_standalone/CLAUDE.md`
- `services/idun_agent_manager/CLAUDE.md`
- `services/idun_agent_web/CLAUDE.md`

Don't invent capabilities. If a CLAUDE.md says "OIDC deferred to MVP-2", surface that.

Add to `docs.json` navigation. Read `docs.json` first; place glossary near the top under a "Concepts" or similar group.

### Task P4.2 — FAQ split

**File:** `docs/faq.mdx` (modify)

Read the file. For each question that conflates engine-only and standalone:
- Replace the answer with a per-path breakdown (use Mintlify `<Tabs>` or a clear bulleted list).

Specific questions per the review:
- "Does Idun require a database?" → engine no, standalone yes, manager Postgres.
- Auth → engine is open by default, standalone has none/password modes, manager has session + OIDC.

Don't rewrite the whole FAQ. Use minimal, surgical edits.

### Task P4.3 — CONTRIBUTING update

**File:** `CONTRIBUTING.md` (modify)

Read the existing 53-line file. Append a "Working on idun-agent-standalone" section per spec §4.3:

```md
## Working on idun-agent-standalone

The `idun-agent-standalone` product spans Python (backend) and TypeScript (frontend) plus a wheel-packaged Next.js static export. Common loops:

**Backend tests:**
```bash
uv run pytest libs/idun_agent_standalone/tests -q
```

**Frontend tests + build:**
```bash
cd services/idun_agent_standalone_ui
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

**End-to-end (Playwright self-boots the standalone server):**
```bash
cd services/idun_agent_standalone_ui
pnpm test:e2e
```

**Wheel:**
```bash
make build-standalone-ui
make build-standalone-wheel
# Smoke-test the wheel in a clean venv:
bash scripts/wheel-install-smoke.sh
```

**Run a dev standalone against the echo agent:**
```bash
cd services/idun_agent_standalone_ui
./e2e/boot-standalone.sh
# Visit http://127.0.0.1:8001
```
```

Adjust to match whatever style the rest of the file uses (heading levels, code-block conventions).

### Task P4.4 — Release smoke checklist

**File:** `docs/superpowers/release-smoke-checklist.md` (new)

```md
# Release Smoke Checklist — idun-agent-standalone

Run before cutting a PyPI / GHCR release.

## Backend
- [ ] `make ci` (lint + mypy + pytest) green
- [ ] `uv run pytest libs/idun_agent_standalone/tests -q` ≥ 110 passed
- [ ] `uv run pytest libs/idun_agent_engine/tests -q` green (or expected skips for langfuse/phoenix/postgres)

## Frontend
- [ ] `cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm test && pnpm build` clean
- [ ] `pnpm test:e2e` 14/14

## Packaging
- [ ] `make build-standalone-ui` produces `out/` and copies into `static/`
- [ ] `make build-standalone-wheel` produces `dist/idun_agent_standalone-*.whl`
- [ ] `bash scripts/wheel-install-smoke.sh` PASS (clean venv install + /health 200)
- [ ] `unzip -l dist/idun_agent_standalone-*.whl` shows `alembic.ini` + `db/migrations/` + `static/index.html`

## Manual smoke
- [ ] Boot standalone, hit `/health` → 200
- [ ] Visit `/`, send "hello" → see `echo: hello` reply
- [ ] Click `+ New` → chat clears
- [ ] Visit `/admin/`, change agent name, save → reload succeeds
- [ ] Visit `/traces/` → recent session is listed
- [ ] Cmd-K (admin) → palette opens
- [ ] Theme toggle (admin) → dark class flips on `<html>`
- [ ] Mobile viewport (375 × 812) → composer reachable, hamburger opens history Sheet

## Docker
- [ ] `docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t idun-standalone:smoke .` builds clean
- [ ] `docker run --rm -p 8001:8000 idun-standalone:smoke` boots; `/health` → 200

## Sign-off
- [ ] All green → tag, push tag, GHCR + PyPI release workflow runs
```

### Task P4.5 — README softening

**File:** `README.md` (modify)

Read the file. Find the comparison table or the claims-list that the review flagged ("no lock-in", "low maintenance", broad SSO/RBAC). Soften surgically:

- "No vendor lock-in" → "Self-hosted; agents run on the open-source engine you can fork and audit. (Adapter coupling: agents are written against LangGraph or ADK SDKs.)"
- "Low maintenance" → remove or qualify ("Self-hosted: maintenance is yours, but the platform handles routine concerns like reload, traces, and migrations.")
- SSO/RBAC: clarify it's a Manager-tier feature; the standalone product has password auth only.
- LangChain positioning: change "first-class" → "supported — LangGraph and ADK are first-class today; LangChain compatibility is in scope".

Don't rewrite the whole README. The goal is to reduce overclaims while keeping the marketing energy.

Look at `docs/index.mdx` for the same table; if it's mirrored, adjust both.

### Task P4.6 — Mark phase specs as Shipped

**Files (modify, append a status line near the title):**
- `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`
- `docs/superpowers/specs/2026-04-26-ui-redesign-editorial-shadcn-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase1-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase2-design.md`
- `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase3-design.md`

For each, after the title line, add:

```md
**Status:** Shipped — 2026-04-26
```

(Use the actual current date; or use `2026-04-26` since this is when the consolidated review work shipped.)

### Task P4.7 — Roadmap

**File:** `docs/roadmap.mdx` (new)

```yaml
---
title: "Roadmap"
description: "Where Idun Agent Platform is today and what we're building next: LangGraph + ADK now, OIDC and metrics later, broader LangChain support over time."
keywords: ["roadmap", "langchain", "oidc", "observability", "metrics"]
---
```

Body: 3 buckets (Today / Next / Later) per spec §4.7. No dates. No promises beyond what's actually planned.

Add to `docs.json` navigation.

### Combined commit for Batch P4

Suggested as one commit since the items are correlated:

```
docs: align positioning, add glossary + roadmap + release checklist (Phase 4)

- New docs/glossary.mdx defining Engine / Standalone / Manager / Web UI
  and the two install paths (engine-only vs standalone product).
- New docs/roadmap.mdx with Today / Next / Later buckets (no dates).
- New docs/superpowers/release-smoke-checklist.md (process doc).
- docs/faq.mdx: split per-path answers for "does it need a DB?" and auth.
- CONTRIBUTING.md: new "Working on idun-agent-standalone" section.
- README.md: soften "no lock-in" / "low maintenance" / SSO/RBAC claims;
  reframe LangChain as "supported, LangGraph + ADK first-class today".
- All 5 prior phase specs marked Status: Shipped.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

OR per-deliverable commits — your call.

---

## Batch P5 — Polish / cleanup

### Task P5.1 — Legacy `--color-*` token sweep on admin components

**Files:**
- `services/idun_agent_standalone_ui/components/admin/SingletonEditor.tsx`
- `services/idun_agent_standalone_ui/components/admin/YamlEditor.tsx`
- `services/idun_agent_standalone_ui/components/admin/AuthGuard.tsx`
- `services/idun_agent_standalone_ui/components/admin/SaveToolbar.tsx`

For each, replace per the same playbook P3.1 used:
- `--color-bg` → `bg-background` (or `var(--background)`)
- `--color-fg` → `text-foreground`
- `--color-muted` → `bg-muted` or `text-muted-foreground`
- `--color-border` → `border-border`
- `--color-accent` → `text-accent`/`bg-accent`

Verify after: `grep -rn "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/components/admin/` returns nothing.

Run `pnpm typecheck && pnpm test && pnpm build` — all green.

### Task P5.2 — `.shimmer` keyframe cleanup

**File:** `services/idun_agent_standalone_ui/app/globals.css`

Verify nothing references `.shimmer` anymore:

```bash
grep -rn "shimmer" services/idun_agent_standalone_ui/
```

Should only show the definition + maybe test files (if `history-sidebar.test.tsx` was rewritten in P3.8 to test `[data-slot="skeleton"]`, no other matches expected).

If clean, remove the `.shimmer` class definition and `@keyframes shimmer` block from `globals.css`. Verify `pnpm build` still produces a valid bundle.

### Task P5.3 — Wheel content inspection in CI

**File:** `scripts/wheel-install-smoke.sh` (modify)

Add content assertions BEFORE the install:

```bash
echo "Inspecting wheel content..."
WHEEL=$(ls -t dist/idun_agent_standalone-*.whl | head -1)

unzip -l "$WHEEL" | grep -q "idun_agent_standalone/alembic.ini" \
  || { echo "MISSING: alembic.ini in wheel" >&2; exit 1; }

unzip -l "$WHEEL" | grep -q "idun_agent_standalone/db/migrations/" \
  || { echo "MISSING: db/migrations/ in wheel" >&2; exit 1; }

unzip -l "$WHEEL" | grep -q "idun_agent_standalone/static/index.html" \
  || { echo "MISSING: static/index.html in wheel" >&2; exit 1; }

echo "Wheel content: OK"
```

Place this before the `pip install` step.

Run the smoke locally to verify: `bash scripts/wheel-install-smoke.sh`. PASS expected.

### Task P5.4 — Final hygiene sweep

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform

# All flagged drift gone:
grep -rn "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/ \
  | grep -v "/__tests__/\|/e2e/" || echo "OK: no legacy --color-* references"

grep -rn "shimmer" services/idun_agent_standalone_ui/ || echo "OK: no shimmer references"

# Tests still green:
cd services/idun_agent_standalone_ui
pnpm typecheck && pnpm test && pnpm build
```

### Combined commit for Batch P5

Two commits acceptable (admin tokens + everything else) OR one combined:

```
chore(standalone-ui): legacy CSS token sweep, .shimmer drop, wheel content checks (Phase 5)

- 4 admin components: --color-bg/fg/muted/border/accent → semantic tokens.
- app/globals.css: drop unused .shimmer class + @keyframes (P3.8 swapped
  HistorySidebar to shadcn Skeleton).
- scripts/wheel-install-smoke.sh: assert alembic.ini + db/migrations/ +
  static/index.html present in the wheel before installing.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Wrap-up

After both batches:

```bash
# Backend / frontend / E2E should still all be green.
uv run pytest libs/idun_agent_standalone/tests -q          # 110+
cd services/idun_agent_standalone_ui
pnpm typecheck && pnpm test && pnpm build                  # clean
pnpm test:e2e                                              # 14/14
bash /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/scripts/wheel-install-smoke.sh
```

Push branch.
