# Standalone MVP Review — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task.

**Goal:** Resolve every P0 ship-blocker from the 2026-04-26 review per `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase1-design.md`.

**Architecture:** 5 self-contained tasks. Each is implementable by a fresh subagent with no cross-task dependencies (run them in any order; recommended order = backend correctness → packaging → UI hydration → hygiene → E2E wiring).

---

## Task P1.1 — Reload state advances only on success (backend)

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/reload.py`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` (where `current_engine_config` is initialized + advanced)
- Test: `libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py` (new)

- [ ] **Step 1: Read** `reload.py` and `app.py` to find where `current_engine_config` is set (probably in `_make_reload_orchestrator` or in `configure_app`).
- [ ] **Step 2:** Verify the `ReloadOutcome` enum has `kind` values `reloaded`, `restart_required`, `init_failed`. If not, align with what the orchestrator already returns.
- [ ] **Step 3:** Modify the reload orchestrator so that:
  - On `kind == "reloaded"`: advance `app.state.current_engine_config` to the new config.
  - On `kind == "restart_required"`: leave `current_engine_config` pointing at the previous config. The DB write (admin route) has already persisted the new staged config — that's correct, the gap is only in-memory.
  - On `kind == "init_failed"`: leave `current_engine_config` unchanged. The orchestrator already does the DB rollback (`commit_with_reload` semantics from `admin/reload_hook.py`).
- [ ] **Step 4: Write the test** at `tests/integration/test_reload_state_correctness.py`:

```python
"""Regression: app.state.current_engine_config must reflect the LIVE agent,
not the latest persisted DB config (P0 from 2026-04-26 review)."""

from __future__ import annotations

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.settings import StandaloneSettings


@pytest.mark.asyncio
async def test_restart_required_does_not_advance_live_config(tmp_path, monkeypatch):
    """Structural change → 202 → live config stays on previous graph."""
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(yaml.safe_dump({
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Live Config Test",
                "graph_definition": "idun_agent_standalone.testing:echo_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }))
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'live.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    monkeypatch.setenv("IDUN_CONFIG_PATH", str(cfg_path))

    from idun_agent_standalone.db.base import Base
    from sqlalchemy.ext.asyncio import create_async_engine

    settings = StandaloneSettings()
    _e = create_async_engine(settings.database_url)
    async with _e.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _e.dispose()

    app = await create_standalone_app(settings)
    try:
        async with app.router.lifespan_context(app), AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            before = app.state.current_engine_config
            assert before is not None

            # Structural change → 202 restart_required
            current = (await client.get("/admin/api/v1/agent")).json()
            current["graph_definition"] = "idun_agent_standalone.testing:other_graph"
            r = await client.put("/admin/api/v1/agent", json=current)
            assert r.status_code == 202

            # Live config must NOT have advanced
            after = app.state.current_engine_config
            assert after is before, (
                "current_engine_config advanced on restart_required — "
                "should still point at the previous live config"
            )
    finally:
        await app.state.db_engine.dispose()
```

- [ ] **Step 5: Run** `uv run pytest libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py -v`. Make it pass.
- [ ] **Step 6: Run the full standalone test suite** to verify no regressions: `uv run pytest libs/idun_agent_standalone/tests -q`.
- [ ] **Step 7: Commit:**

```
fix(standalone): current_engine_config advances only on successful hot reload (P1.1)

Fixes a state drift where structural edits (202 restart_required) and
init_failed reloads advanced the in-memory live config pointer to a
config the engine isn't actually running. Subsequent non-structural edits
diffed against the wrong baseline.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md (P0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task P1.2 — Wheel-safe Alembic migrations + install smoke

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrations.py` (or wherever the runner lives — search for `alembic.ini`)
- Modify: `libs/idun_agent_standalone/pyproject.toml` (ensure `alembic.ini` is included in the wheel)
- Modify: `libs/idun_agent_standalone/docker/Dockerfile.base` (drop the `alembic.ini` copy workaround)
- Test: `libs/idun_agent_standalone/tests/integration/test_wheel_install_smoke.sh` (new shell script) OR a CI step

- [ ] **Step 1: Locate** the migration runner. `grep -rn "alembic.ini" libs/idun_agent_standalone/src` — find the file that resolves the path via `Path(__file__).parents[3]`.
- [ ] **Step 2: Move `alembic.ini`** into the package directory: `libs/idun_agent_standalone/src/idun_agent_standalone/alembic.ini`. Update the `script_location` inside it to a path relative to the new location (`db/migrations` if migrations live there, or absolute via `%(here)s`).
- [ ] **Step 3: Replace the path resolution** with `importlib.resources`:

```python
from importlib import resources

def _alembic_ini_path() -> str:
    """Resolve packaged alembic.ini in both editable and wheel installs."""
    return str(resources.files("idun_agent_standalone") / "alembic.ini")
```

- [ ] **Step 4: Verify wheel inclusion.** Build the wheel: `make build-standalone-wheel`. Inspect:
```bash
unzip -l dist/idun_agent_standalone-*.whl | grep alembic
```
The `alembic.ini` and the `db/migrations/` versions tree must be present. If hatch's wheel builder excludes them, add to `[tool.hatch.build.targets.wheel.force-include]` or similar.

- [ ] **Step 5: Drop the Docker workaround.** Edit `libs/idun_agent_standalone/docker/Dockerfile.base` — remove any `COPY alembic.ini /app/...` line that was working around the wheel-install bug.
- [ ] **Step 6: Write a smoke script** at `scripts/wheel-install-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Build fresh wheel
make build-standalone-ui
make build-standalone-wheel

# Clean venv
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
python3 -m venv "$TMP/venv"

WHEEL=$(ls -t dist/idun_agent_standalone-*.whl | head -1)
"$TMP/venv/bin/pip" install --quiet "$WHEEL"

# Smoke: scaffold + serve + health
"$TMP/venv/bin/idun-standalone" init "$TMP/scratch" >/dev/null
PORT=8765
DATABASE_URL="sqlite+aiosqlite:///$TMP/scratch/smoke.db" \
  IDUN_ADMIN_AUTH_MODE=none \
  IDUN_PORT=$PORT \
  "$TMP/venv/bin/idun-standalone" serve \
  --config "$TMP/scratch/config.yaml" \
  --port $PORT &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -rf $TMP" EXIT

# Wait for boot
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    echo "Wheel install smoke: PASS"
    exit 0
  fi
  sleep 1
done
echo "Wheel install smoke: FAIL — server did not start" >&2
exit 1
```

`chmod +x scripts/wheel-install-smoke.sh`.

- [ ] **Step 7: Run the smoke locally.** It must pass.
- [ ] **Step 8: Add a CI job** in `.github/workflows/standalone-ci.yml`:

```yaml
  wheel-install-smoke:
    name: Wheel install smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
          cache-dependency-path: services/idun_agent_standalone_ui/pnpm-lock.yaml
      - name: Install pnpm deps
        run: cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile
      - name: Run smoke
        run: scripts/wheel-install-smoke.sh
```

- [ ] **Step 9: Verify the existing test suite still passes** in editable mode: `uv run pytest libs/idun_agent_standalone/tests -q`.
- [ ] **Step 10: Commit:**

```
fix(standalone): wheel-safe Alembic migrations via importlib.resources (P1.2)

- Moves alembic.ini into the package directory.
- Resolves alembic.ini via importlib.resources so plain `pip install
  idun-agent-standalone` works (previously only editable installs worked).
- Drops the Docker workaround that copied alembic.ini to the parent dir.
- Adds scripts/wheel-install-smoke.sh and a CI job that builds the wheel,
  installs it in a clean venv, and asserts /health responds.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md (P0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task P1.3 — Hydrate assistant text from `MESSAGES_SNAPSHOT`

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` (extend)
- Test: `services/idun_agent_standalone_ui/e2e/chat.spec.ts` (extend)

- [ ] **Step 1: Read** `lib/use-chat.ts` to understand the existing event handling. Identify the `MESSAGES_SNAPSHOT` / `MessagesSnapshot` case (currently a no-op around lines 211–215).
- [ ] **Step 2: Wire snapshot hydration.** When `MESSAGES_SNAPSHOT` arrives:
  - Extract `e.messages` (array of `{id, role, content, ...}`).
  - Find the latest `role === "assistant"` (or `"ai"`) entry — the engine sometimes uses either.
  - If the current `assistantMsg.text` is empty (no streaming content has accumulated), set it to the snapshot's content.
  - Be additive: don't overwrite text that came from `TEXT_MESSAGE_CONTENT` deltas.

```ts
case "MESSAGES_SNAPSHOT":
case "MessagesSnapshot": {
  const snap = (e.messages ?? []) as Array<{role?: string; content?: string}>;
  const lastAssistant = [...snap].reverse().find((x) =>
    x.role === "assistant" || x.role === "ai"
  );
  if (lastAssistant?.content) {
    updateAssistant((m) => {
      // Only hydrate if no streaming text has accumulated.
      if (m.role === "assistant" && (!m.text || m.text.trim().length === 0)) {
        return { ...m, text: stripThink(String(lastAssistant.content)) };
      }
      return m;
    });
  }
  break;
}
```

- [ ] **Step 3: Belt-and-suspenders fallback on `RUN_FINISHED`.** Track the latest `MESSAGES_SNAPSHOT` content in a closure-scoped variable and, on `RUN_FINISHED`, hydrate the assistant text if it's still empty. (Some adapters emit `MESSAGES_SNAPSHOT` *before* the assistant message exists, so the in-band hydration above might miss it.)

```ts
// At the top of send(), before the runAgent call:
let latestAssistantSnapshot: string | null = null;

// In MESSAGES_SNAPSHOT case (above), also set:
latestAssistantSnapshot = lastAssistant?.content ? String(lastAssistant.content) : latestAssistantSnapshot;

// In RUN_FINISHED:
case "RUN_FINISHED":
case "RunFinished":
  setStatus("idle");
  updateAssistant((m) => {
    if (m.role === "assistant" && (!m.text || m.text.trim().length === 0) && latestAssistantSnapshot) {
      return { ...m, text: stripThink(latestAssistantSnapshot), streaming: false };
    }
    return m.role === "assistant" ? { ...m, streaming: false } : m;
  });
  break;
```

- [ ] **Step 4: Add Vitest test** in `__tests__/use-chat.test.ts`:

```ts
it("hydrates assistant text from MESSAGES_SNAPSHOT when streaming deltas are absent", async () => {
  // Mock runAgent to emit only a snapshot + RUN_FINISHED.
  const events = [
    { type: "RUN_STARTED" },
    { type: "MESSAGES_SNAPSHOT", messages: [
      { role: "user", content: "ping" },
      { role: "assistant", content: "echo: ping" },
    ]},
    { type: "RUN_FINISHED" },
  ];
  vi.mocked(runAgent).mockImplementation(async ({ onEvent }) => {
    for (const e of events) onEvent(e as any);
  });

  const { result } = renderHook(() => useChat("t1"));
  await act(async () => { await result.current.send("ping"); });

  const assistant = result.current.messages.find((m) => m.role === "assistant");
  expect(assistant?.text).toBe("echo: ping");
  expect(result.current.status).toBe("idle");
});
```

- [ ] **Step 5: Run vitest.** Must pass.
- [ ] **Step 6: Add E2E assertion** in `e2e/chat.spec.ts`:

```ts
test("echo agent response renders in chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /message/i }).fill("hello from review");
  await page.keyboard.press("Enter");
  // The user message should appear immediately:
  await expect(page.getByText("hello from review").first()).toBeVisible({ timeout: 5000 });
  // The echo agent should respond. The reply may take a moment as the agent runs.
  await expect(page.getByText(/echo: hello from review/i)).toBeVisible({ timeout: 15000 });
});
```

- [ ] **Step 7: Run E2E locally** (after P1.5 lands the Playwright `webServer`, OR boot the standalone manually and run `E2E_BASE_URL=http://127.0.0.1:8001 pnpm test:e2e`). Adjust selectors to whatever the welcome hero / composer use.
- [ ] **Step 8: Run frontend full suite:** `pnpm typecheck && pnpm test && pnpm build`. All green.
- [ ] **Step 9: Commit:**

```
fix(standalone-ui): hydrate assistant text from MESSAGES_SNAPSHOT (P1.3)

LangGraph agents using llm.invoke() emit no TEXT_MESSAGE_CONTENT deltas —
they emit MESSAGES_SNAPSHOT only. The chat was rendering an empty
assistant turn even though the backend executed the agent and persisted
the response. Now useChat hydrates assistant.text from the latest snapshot
when streaming deltas are absent at RUN_FINISHED.

Adds Vitest coverage and a Playwright E2E that asserts `echo: <message>`.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md (P0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task P1.4 — Repo hygiene (remove .cursor/.claude artifacts)

**Files to delete:**
- `.cursor/hooks.json` (if tracked)
- `.cursor/` (the whole directory if it only contains tooling)
- `.claude/settings.json` (if tracked at repo root — keep `~/.claude/settings.json` global)
- `.claude/worktrees/wonderful-spence` (gitlink — `git rm` it)

**Files to modify:**
- `.gitignore`

- [ ] **Step 1: Audit what's tracked.** Run from repo root:
```bash
git ls-files .cursor/ .claude/ 2>&1 | head
git ls-tree HEAD .cursor/ .claude/ 2>&1 | head
```
Capture the list of tracked files.

- [ ] **Step 2: Remove tracked tooling artifacts.** For each tracked file in `.cursor/` and `.claude/` (not in `~/.claude/`), `git rm -r <path>`. Especially:
  - `.cursor/hooks.json` (the absolute-path version)
  - `.claude/settings.json` (if it contains personal/local settings)
  - Any `.claude/worktrees/wonderful-spence` gitlink

  **Be careful**: do NOT remove anything that's intentionally part of the project (e.g., shared MCP server registration). If a `.claude/settings.json` contains shared team settings (e.g., minimum permissions), preserve it; only remove if it's truly local junk.

- [ ] **Step 3: Update `.gitignore`** to prevent regressions. Append:

```
# Local agent / tooling state (never commit)
/.claude/scheduled_tasks.lock
/.claude/worktrees/
/.cursor/
```

(Note: only ignore at repo root via leading `/`. If subdirectory `.claude/` directories are intentional team config, refine.)

- [ ] **Step 4: Commit the review file** while we're at it (it's in `docs/superpowers/reviews/` which is currently untracked):

```bash
git add docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md
```

- [ ] **Step 5: Verify tree is clean** after all changes:

```bash
git status -s
```

Expect: only the staged deletions / additions.

- [ ] **Step 6: Commit:**

```
chore(repo): drop local agent/tooling artifacts; ignore them going forward (P1.4)

- Removes .cursor/hooks.json (absolute local paths), .claude/settings.json
  (per-machine), .claude/worktrees/wonderful-spence (gitlink).
- Adds .gitignore rules so they don't sneak back in.
- Commits the 2026-04-26 review document used to drive Phase 1.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md (P0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task P1.5 — E2E boot doesn't dirty source tree + Playwright `webServer`

**Files:**
- Modify: `services/idun_agent_standalone_ui/e2e/boot-standalone.sh`
- Modify: `services/idun_agent_standalone_ui/playwright.config.ts`
- Modify: `.github/workflows/standalone-ci.yml`

- [ ] **Step 1: Read the existing boot script.** Confirm it currently calls `make build-standalone-ui` which copies into `libs/.../static/`.

- [ ] **Step 2: Refactor the boot script** to build into a temp dir and use `IDUN_UI_DIR`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PORT=${E2E_PORT:-8001}
TMPDIR=$(mktemp -d)
DBFILE="$TMPDIR/standalone.db"
UIDIR="$TMPDIR/ui"

trap 'kill $SERVER_PID 2>/dev/null || true; rm -rf "$TMPDIR"' EXIT

# Build the UI into a temp dir (do NOT touch libs/.../static/).
cd "$ROOT/services/idun_agent_standalone_ui"
pnpm build > /dev/null
cp -r out "$UIDIR"

# Use the echo agent config that lives in the standalone test fixtures, OR scaffold a fresh one.
CONFIG="$ROOT/libs/idun_agent_standalone/examples/echo/config.yaml"
if [ ! -f "$CONFIG" ]; then
  # Fall back: scaffold a project to a temp dir and use its config.
  uv run --project "$ROOT" idun-standalone init "$TMPDIR/scratch" > /dev/null
  CONFIG="$TMPDIR/scratch/config.yaml"
fi

# Boot.
cd "$ROOT"
IDUN_PORT=$PORT \
  IDUN_HOST=127.0.0.1 \
  IDUN_ADMIN_AUTH_MODE=none \
  IDUN_UI_DIR="$UIDIR" \
  IDUN_CONFIG_PATH="$CONFIG" \
  DATABASE_URL="sqlite+aiosqlite:///$DBFILE" \
  uv run --project "$ROOT" idun-standalone serve \
    --port $PORT --host 127.0.0.1 --auth-mode none \
    --config "$CONFIG" \
    --database-url "sqlite+aiosqlite:///$DBFILE" &

SERVER_PID=$!

# Wait for boot.
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    echo "ready on :$PORT"
    wait $SERVER_PID
    exit 0
  fi
  sleep 1
done
echo "boot timeout" >&2
exit 1
```

If there's no `examples/echo/config.yaml`, fall back to `idun-standalone init` (note: requires the wheel install path to work — depends on P1.2).

- [ ] **Step 3: Wire Playwright `webServer`** in `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8001";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined  // user is providing the URL, don't auto-boot
    : {
        command: "./e2e/boot-standalone.sh",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
```

- [ ] **Step 4: Update CI** in `.github/workflows/standalone-ci.yml` so the E2E job no longer separately invokes `boot-standalone.sh` — Playwright's `webServer` does it.

```yaml
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - uses: astral-sh/setup-uv@v3
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
          cache-dependency-path: services/idun_agent_standalone_ui/pnpm-lock.yaml
      - name: uv sync
        run: uv sync --all-groups
      - name: pnpm install
        run: cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: cd services/idun_agent_standalone_ui && pnpm exec playwright install --with-deps chromium
      - name: Run E2E
        run: cd services/idun_agent_standalone_ui && pnpm test:e2e
```

- [ ] **Step 5: Verify locally.** From a clean tree (`git status` clean):
```bash
cd services/idun_agent_standalone_ui
pnpm test:e2e
git status -s   # Should still be clean
```

If `static/` shows as modified, the boot script is still invoking `make build-standalone-ui` somewhere — find and fix.

- [ ] **Step 6: Commit:**

```
fix(standalone-ui): E2E boot uses temp dir; Playwright webServer for CI (P1.5)

- e2e/boot-standalone.sh builds the UI into a temp directory and points
  IDUN_UI_DIR there, instead of mutating libs/.../static/. Tests no longer
  dirty the source tree.
- playwright.config.ts now has a webServer entry so `pnpm test:e2e` boots
  its own backend automatically (CI-friendly). Skipped when
  E2E_BASE_URL is set externally.
- standalone-ci.yml E2E job simplified — no separate boot step.

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md (P0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Wrap-up

After all 5 tasks land:

1. Run the full verification matrix (see spec §3).
2. Confirm `git status` is clean after a full test cycle.
3. Update the review doc to mark P0 items as resolved (optional).
4. Phase 1 is complete; user can decide whether to push branch / open PR / continue to Phase 2.
