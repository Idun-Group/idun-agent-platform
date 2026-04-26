# Standalone MVP Review — Phase 1 (P0 Unblockers) Design Spec

**Status:** Shipped — 2026-04-26

**Goal:** Address every P0 ship-blocker from the 2026-04-26 review so that `feat/standalone-agent-mvp` can merge to `main` cleanly and the OSS install path (`pip install idun-agent-standalone` → boot → first chat → see traces) works end-to-end.

**Source review:** `docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md`

**Out of scope (later phases):** runtime gaps (prompts/integrations/password durability/session-secret/trace ordering/theme deep-merge), UI polish (responsive, a11y, shadcn drift), docs alignment.

---

## 1. Deliverables

### 1.1 Chat hydrates assistant text from `MESSAGES_SNAPSHOT`

**Problem:** `useChat` only listens to `TEXT_MESSAGE_CONTENT` deltas. LangGraph agents using `llm.invoke()` (most of them) emit only `MESSAGES_SNAPSHOT` — no token deltas. The chat renders an empty assistant turn even though the backend ran the agent and persisted the response.

**Fix:**
- In `lib/use-chat.ts`, when `MESSAGES_SNAPSHOT` arrives, scan for `role === "assistant"` (or `ai`) entries. If the current assistant message's `text` is still empty AND there's no active streaming text segment, hydrate `text` from the snapshot's last assistant message content.
- Also fall back on `RUN_FINISHED`: if `text` is still empty, look at the most recent `MESSAGES_SNAPSHOT` event and hydrate.
- Preserve existing `TEXT_MESSAGE_CONTENT` streaming behavior — when deltas are present, ignore snapshot hydration for that segment.

**Acceptance:**
- `pnpm test` passes a new `use-chat` test asserting that a fake stream `[RUN_STARTED, MESSAGES_SNAPSHOT(assistant="echo: hi"), RUN_FINISHED]` populates `text` to `"echo: hi"`.
- Playwright `chat.spec.ts` adds an assertion that after sending `"hello from review"`, the page shows `text=/echo: hello from review/i`.

### 1.2 Wheel-safe Alembic migrations

**Problem:** `Path(__file__).parents[3]` resolves correctly only in editable installs. `pip install idun-agent-standalone` from PyPI fails on first migration run.

**Fix:**
- Resolve `alembic.ini` via `importlib.resources.files("idun_agent_standalone")` (or use a packaged path). Ship `alembic.ini` inside the package, not the repo root.
- The Alembic env reads `script_location` from `alembic.ini` — make that path also resolvable inside the wheel.
- Drop the Docker workaround that copies `alembic.ini` to the parent directory.

**Acceptance:**
- New CI job: build wheel → fresh venv → `pip install dist/*.whl` → run `idun-standalone init scratch && cd scratch && idun-standalone serve` (background) → `curl /health` returns 200.
- Existing test suite still passes (editable install).
- Docker image builds and boots without the `alembic.ini` copy step.

### 1.3 Reload state advances only on success

**Problem:** `app.state.current_engine_config` advances even when reload returns `restart_required` or `init_failed`. State drifts from the live agent.

**Fix:**
- In the reload orchestrator (`reload.py`), only update `app.state.current_engine_config` after the engine successfully hot-loaded the new config (i.e., `ReloadOutcome.kind == "reloaded"`).
- On `restart_required`: leave `current_engine_config` pointing at the previous live config. Persist the new config to DB (so the next restart picks it up) but don't advance the in-memory pointer.
- On `init_failed`: leave `current_engine_config` pointing at the previous live config. Roll back the DB write (already does — verify).

**Acceptance:**
- New regression test: structural change → 202 → assert `app.state.current_engine_config` is unchanged. Then non-structural change → 200 → assert reload uses the previous (still-live) config as the diff base, not the staged-restart-required one.
- New test: simulated `init_failed` → assert `app.state.current_engine_config` is unchanged.

### 1.4 Repo hygiene

**Problem:** Local agent/tooling artifacts polluted the branch:
- `.cursor/hooks.json` (absolute local paths)
- `.claude/settings.json`
- `.claude/worktrees/wonderful-spence` gitlink
- `.claude/scheduled_tasks.lock` (untracked, but should be ignored)
- `static/` build output (gitignored, but `make build-standalone-ui` still mutates the tracked tree by overwriting `.gitkeep`)

**Fix:**
- Remove tracked `.cursor/`, `.claude/settings.json`, `.claude/worktrees/wonderful-spence` from the branch (`git rm`).
- Extend `.gitignore` to cover `.claude/scheduled_tasks.lock`, `.claude/worktrees/`, `.cursor/`.
- Verify `libs/idun_agent_standalone/src/idun_agent_standalone/static/` stays gitignored (already is).

**Acceptance:**
- `git status` shows no `.cursor/` or `.claude/` files at branch root.
- `make build-standalone-ui` does not produce tracked changes.

### 1.5 E2E boot doesn't dirty source tree + Playwright `webServer` wired for CI

**Problem:**
- `e2e/boot-standalone.sh` runs `make build-standalone-ui` which copies into `libs/.../static/`, dirtying the source tree.
- `playwright.config.ts` has no `webServer` block, so `pnpm test:e2e` in CI runs against nothing.

**Fix:**
- Refactor `boot-standalone.sh` to:
  1. Build the UI into a temp dir (`pnpm build` produces `out/`; copy to `$TMPDIR/idun-standalone-ui-$$`).
  2. Export `IDUN_UI_DIR=$TMPDIR/...` and start the standalone server.
  3. Cleanup temp dir on exit (`trap`).
- Add `webServer` to `playwright.config.ts` invoking the boot script with sensible env (config path, port, DB URL).
- Update `standalone-ci.yml` to rely on Playwright's `webServer` rather than calling the boot script separately.

**Acceptance:**
- `pnpm test:e2e` works locally without dirtying `libs/.../static/`.
- CI runs `pnpm test:e2e` and Playwright boots its own server via `webServer`.
- `git status` after `pnpm test:e2e` shows no tracked file changes.

---

## 2. Architecture decisions

**D1: Snapshot hydration is additive, not replacing.** Streaming-first remains primary. Snapshot is a fallback when text is empty at finish time. This keeps the "real-time tokens" UX for streaming agents (Claude/OpenAI/etc. with `astream`).

**D2: Wheel migrations use `importlib.resources`.** Standard, ships in stdlib, works in zip wheels too.

**D3: Reload state semantics — `current_engine_config` is the *live* config.** Persisted DB config is the *latest staged* config. The two diverge when `restart_required` returns 202.

**D4: Hygiene cleanup is one-shot.** No re-auditing in CI; just delete and gitignore.

**D5: E2E uses temp UI dir, not the package's `static/`.** This decouples test runs from packaging. The wheel always uses `static/` (rebuilt at release).

---

## 3. Verification

```bash
# Backend
uv run pytest libs/idun_agent_standalone/tests -q

# Frontend
cd services/idun_agent_standalone_ui
pnpm typecheck
pnpm test
pnpm build

# E2E (now self-booting)
pnpm test:e2e

# Wheel install smoke (new)
make build-standalone-ui
make build-standalone-wheel
python -m venv /tmp/wheel-smoke
/tmp/wheel-smoke/bin/pip install dist/idun_agent_standalone-*.whl
/tmp/wheel-smoke/bin/idun-standalone init /tmp/scratch
cd /tmp/scratch && /tmp/wheel-smoke/bin/idun-standalone serve --port 8765 &
sleep 5 && curl -fsS http://127.0.0.1:8765/health
```

All must pass.

---

## 4. Out of scope (Phase 2+)

- Prompt → EngineConfig wiring
- Integration provider casing
- Password durability model
- Session secret length enforcement
- Trace event ordering across multi-run sessions
- Theme deep-merge
- Login page semantic tokens
- Chat history hydrate on session switch
- Trace search backend
- patchSession removal
- Responsive layouts / a11y / shadcn drift
- Docs glossary / FAQ / CONTRIBUTING

---

## 5. Acceptance criteria (full)

- All P0 review items resolved per §1.
- Backend tests, frontend tests, frontend build, E2E all green.
- New wheel install smoke test passes.
- `git status` clean after a full test run.
- Branch is mergeable to `main` from a P0-correctness standpoint (Phase 2+ items remain as known gaps, documented separately).
