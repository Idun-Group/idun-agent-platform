# Standalone Agent MVP — Completion Plan

> **For agentic workers:** this plan finishes the gaps between the current `feat/standalone-agent-mvp` branch and `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`. Each task is self-contained and testable.

**Goal:** Ship a fully spec-compliant `idun-agent-standalone` v0.1.0 — backend, UI, packaging, CI, docs.

**Source of truth:** the original design spec (`docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`). Where the prior plan diverged, the spec wins.

**Branch state at plan time:** 39 commits in, Phases 0–13 mostly done plus initial passes at 14 + 15. Three deep audits surfaced concrete gaps. This plan addresses them all.

**Three execution waves, each runnable by a subagent:**

```
Wave A — Backend completeness (P0)
Wave B — UI completeness (P0)
Wave C — Packaging + CI + Docs polish (P0/P1)
```

After all three waves, a fourth wave runs E2E + final verification.

---

## Wave A — Backend completeness

### A1. Restore atomic reload semantics (DB rollback on init failure)

**Spec ref:** §7.1 line 488 — *"Reload rollback: new-config init failure rolls back DB txn AND keeps old agent running."*

**Current state:** Every mutating admin handler calls `await s.commit()` BEFORE `trigger_reload(...)`. Init failure → DB has new bad config + agent recovered to old. Persisted state diverges from runtime state. Bad config replays on next boot.

**Files to modify:**
- `libs/idun_agent_standalone/src/idun_agent_standalone/admin/reload_hook.py` (and `_make_reload_orchestrator` in `app.py`)
- `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/{agent,guardrails,memory,observability,mcp_servers,integrations}.py`

**Approach:**
1. Move from "commit, then try reload" to "flush, try reload, then commit-or-rollback" using a single transaction per request.
2. New helper `commit_with_reload(session, request, structural_change_check)`:
   - `await session.flush()` (writes pending without commit)
   - call `orchestrate_reload(...)` against the new state visible in this session
   - on `reloaded` → `await session.commit()` → return None (success)
   - on `restart_required` → `await session.commit()` → return JSONResponse(202)
   - on `init_failed`/`recovered=True` → `await session.rollback()` → return JSONResponse(500, recovered=True)
   - on `init_failed`/`recovered=False` → `await session.rollback()` → return JSONResponse(500, recovered=False)
3. `assemble_engine_config` already reads via the same session, so the flushed-but-uncommitted state is visible to it.
4. Replace every `await s.commit() ... await trigger_reload(...)` site with `resp = await commit_with_reload(s, request, structural_check); if resp is not None: return resp`.

**Test:**
- `tests/integration/test_reload_atomic.py` — new file. Use the echo agent + a config that breaks `configure_app` (e.g. invalid `graph_definition` path that resolves at run-time but raises). Send `PUT /admin/api/v1/agent` with the bad config. Assert 500 + `recovered=True`. Then `GET /admin/api/v1/agent` and assert the OLD config is returned (DB rolled back). Then send a chat turn — assert it still works (old agent still serving).

**Acceptance:**
- All existing admin tests still pass.
- New atomic test passes.

---

### A2. `GET /admin/api/v1/config/export` endpoint

**Spec ref:** §3.3 lists `GET /config/export`. Currently only the CLI dumps YAML.

**Files:**
- `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/config.py` (new)
- Wire into `app.py` and `testing_app.py`.

**Implementation:**
```python
from fastapi import APIRouter, Depends, Request, Response
from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.config_io import export_db_as_yaml

router = APIRouter(
    prefix="/admin/api/v1/config",
    tags=["config"],
    dependencies=[Depends(require_auth)],
)

@router.get("/export", response_class=Response)
async def export_config(request: Request) -> Response:
    sm = request.app.state.sessionmaker
    async with sm() as session:
        body = await export_db_as_yaml(session)
    return Response(content=body, media_type="application/yaml",
                    headers={"Content-Disposition": "attachment; filename=idun-config.yaml"})
```

**Test:** `tests/integration/admin/test_config_export.py` — POST seed data via existing helpers, GET the endpoint, parse the YAML, assert the agent name round-trips.

---

### A3. `GET /admin/api/v1/integrations/{id}` per-id getter

**Spec ref:** §3.3 lists CRUD symmetry; today only list/create/patch/delete exist.

**File:** `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/integrations.py`

Add a `GET /{iid}` route mirroring `mcp_servers.py:get_mcp`. 404 on missing.

**Test:** Extend `tests/integration/admin/test_collections.py` (or `test_admin_routers.py`) with a per-id read assertion.

---

### A4. Bootstrap-hash drift warning

**Spec ref:** §3.1 — *"On subsequent starts the YAML is ignored — a one-line log warning is emitted if its hash differs from the bootstrap hash."*

**Files:**
- `libs/idun_agent_standalone/src/idun_agent_standalone/db/models.py` — add `BootstrapMetaRow(id="singleton", config_hash, bootstrapped_at)`. Or reuse a generic `MetaRow` if cleaner.
- New Alembic migration `0002_bootstrap_meta.py`.
- `libs/idun_agent_standalone/src/idun_agent_standalone/config_io.py` — compute SHA-256 of the YAML bytes, store on first seed.
- `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` (`_bootstrap_if_needed`) — on subsequent boots compare current YAML hash (when `IDUN_CONFIG_PATH` exists and points at a readable file) to the stored hash. `logger.warning(...)` on mismatch with both hashes truncated.

**Test:** `tests/integration/test_bootstrap_hash.py` — boot once with config A, boot again with modified config A', assert log warning fired.

---

### A5. Fail fast on `AuthMode.OIDC`

**Spec ref:** §8.1 — OIDC is deferred. Currently selecting it silently breaks login.

**File:** `libs/idun_agent_standalone/src/idun_agent_standalone/settings.py:validate_for_runtime`

Raise `ValueError("OIDC auth is reserved for MVP-2; set IDUN_ADMIN_AUTH_MODE to 'none' or 'password'")` when `auth_mode == AuthMode.OIDC`.

**Test:** unit test in `tests/unit/test_settings.py`.

---

### A6. Re-attach trace observer on engine `/reload`

**Spec ref:** §3.6 step 8 — re-attach observer to the new agent on every reload, including via the engine's own `/reload` endpoint.

**Current:** standalone's `_make_reload_orchestrator` re-attaches on admin-driven reload. The engine's `POST /reload` (still reachable when `auth_mode=none`) also calls `cleanup_agent` + `configure_app` but does NOT re-attach our observer.

**Files:**
- `libs/idun_agent_engine/src/idun_agent_engine/server/routers/base.py:reload_config`
- OR more cleanly: `libs/idun_agent_engine/src/idun_agent_engine/server/lifespan.py:configure_app` exposes a post-init hook (list of callbacks on `app.state.post_configure_callbacks`).

**Approach:** Engine-side, add `app.state.post_configure_callbacks: list[Callable[[FastAPI], Awaitable[None]]]` invoked at the end of `configure_app`. Standalone registers a callback that re-attaches the observer. This is also the cleanest place to handle MCP per-server failure surfacing later (A7).

**Test:**
- Engine: extend `tests/integration/server/test_reload_auth.py` to assert post-configure callbacks fire.
- Standalone: extend `tests/integration/test_reload_flow.py` with an explicit `POST /reload` (engine route) hit and assert traces still flow.

---

### A7. MCP per-server failure isolation (D6)

**Spec ref:** D6 — *"warn and continue per-server"*. Today the engine wraps the whole `MCPClientRegistry` init in one try/except.

**File:** `libs/idun_agent_engine/src/idun_agent_engine/mcp/registry.py:MCPClientRegistry.__init__` (or wherever the construction lives).

**Approach:** Iterate `mcp_servers` list, try/except per server, append a `failed: list[McpFailure]` attribute on the registry. Exposed via a small accessor `app.state.failed_mcp_servers` so the UI can render the red badge.

**Backend test:** unit test giving the registry a list with one bad server (e.g. `command: /nonexistent`) — assert init succeeds with reduced toolset.

**Standalone surface:** `GET /admin/api/v1/mcp-servers` response should include a `status` field per server (`"running" | "failed"`) computed from `app.state.failed_mcp_servers`. UI work in B6 below.

---

### A8. Traces `?search=` query param

**Spec ref:** §4.7 — *"text search (server-side `LIKE` for MVP-1)"*. §8.1 only defers FTS, not basic LIKE.

**File:** `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py:get_session_events`

Add `search: str | None = Query(None)` param. When set, filter `TraceEventRow.payload::text ILIKE %search%` (SQLite uses `LIKE`; for case insensitivity wrap in `lower(payload)` and `lower(search)`). Apply at the SQL level — do NOT pull all rows into Python.

Also expose `?search=` on `GET /admin/api/v1/traces/sessions` (filter sessions whose events match).

**Test:** `tests/integration/admin/test_traces_search.py` — seed events with payloads `{"text": "hello world"}` vs `{"text": "goodbye"}`, search `?search=hello`, assert only first returned.

---

### A9. Test fixtures: `standalone_app`, `authed_client`, `fake_run`

**Spec ref:** §7.2.

**File:** `libs/idun_agent_standalone/tests/conftest.py` (currently empty).

```python
import pytest
from idun_agent_standalone.testing_app import make_test_app

@pytest.fixture
async def standalone_app(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path}/test.db")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, sm = await make_test_app()
    yield app, sm
    await app.state.db_engine.dispose()

@pytest.fixture
async def authed_client(standalone_app):
    # ... build httpx AsyncClient with valid sid cookie
    ...

@pytest.fixture
def fake_run():
    """Scripted AG-UI event sequence — RunStarted, TextMessageContent×2, ToolCallStart, ToolCallEnd, RunFinished."""
    ...
```

Refactor at most 2-3 existing tests to use the fixtures as a sanity check; do not refactor wholesale (risk).

---

### A10. Integration tests for previously-uncovered paths

**Spec ref:** §7.2 + audit gaps.

Add:
- `tests/integration/test_structural_change_restart.py` — PUT agent with new framework or graph_definition → assert `202 {"restart_required": true}`. Assert DB has new state.
- `tests/integration/test_reload_recovery.py` — PUT a config that fails `configure_app`, assert 500 with `recovered: true`, assert subsequent chat turns still work with the previous agent.

---

## Wave B — UI completeness

### B1. Wire Monaco for YAML/Jinja editing

**Spec ref:** §4.6.

**Files:**
- `services/idun_agent_standalone_ui/package.json` — add `@monaco-editor/react@^4.6.0`.
- `services/idun_agent_standalone_ui/components/admin/YamlEditor.tsx` (new) — wraps `dynamic(() => import('@monaco-editor/react'), { ssr: false })`. Two modes: `readOnly` (preview below form) and `editable` (when "Edit YAML" toggled). Uses `yaml@^2.6.0` to convert form ↔ YAML round-trip.
- `services/idun_agent_standalone_ui/components/admin/SingletonEditor.tsx` — replace `JsonEditor` with `YamlEditor` and add the "Edit YAML" toggle.
- Same swap in `app/admin/agent/page.tsx`, `app/admin/prompts/page.tsx` (Jinja highlighting via `language="handlebars"` is good enough for MVP-1).

**Acceptance:** Build still under 200 KB on `/` (Monaco lazy-loaded, code-split on `/admin/*`).

---

### B2. Provider-specific forms — Memory, Observability, Guardrails

**Spec ref:** §4.6.

**Files:**
- `app/admin/memory/page.tsx` — type select (memory | sqlite | postgres) + conditional `db_url` field.
- `app/admin/observability/page.tsx` — provider sections (Langfuse, Phoenix, GCP Trace, GCP Logging) with `enabled` switch + credentials fields. Use `idun_agent_schema` types when readable from OpenAPI; otherwise hand-typed `<select>` per provider.
- `app/admin/guardrails/page.tsx` — input/output split, dynamic list of guards each with a `config_id` selector matching `GuardrailConfigId` enum. JSON escape-hatch via "Edit YAML" toggle from B1.

For all three, retain the read-only YAML preview from B1. Wire `react-hook-form` + `zod` (currently declared deps but unused).

**Acceptance:** Each form validates client-side, save → reload → toast.

---

### B3. AG-UI text/thinking lifecycle handling

**Spec ref:** §4.5.

**File:** `services/idun_agent_standalone_ui/lib/use-chat.ts`.

Handle:
- `TEXT_MESSAGE_START` — open a new assistant text segment (or noop if buffer is empty — pragmatic).
- `TEXT_MESSAGE_END` — close current text segment.
- `THINKING_TEXT_MESSAGE_CONTENT` (if emitted) — append to current `thinking` slot.
- `THINKING_END` — close.
- `STEP_STARTED`, `STEP_FINISHED`, `STATE_DELTA`, `STATE_SNAPSHOT`, `MESSAGES_SNAPSHOT`, `RUN_STARTED`, `RAW` — explicit no-op cases (silence default-fallthrough warnings).

Verify against actual events emitted by the running echo agent (already smoke-tested).

---

### B4. Session switcher: list last 10 sessions

**Spec ref:** §4.5.

**File:** `services/idun_agent_standalone_ui/components/chat/SessionSwitcher.tsx`.

Replace stub with:
- `useQuery` on `api.listSessions({ limit: 10 })`.
- Dropdown menu (use existing `Card` primitive or a small inline `<details>` for now — no new dep) listing each session by truncated id + last_event_at.
- Click → push `/?session=<id>`.
- "+ New session" item at top.

---

### B5. Traces session list: missing columns + search + inline title

**Spec ref:** §4.7.

**File:** `services/idun_agent_standalone_ui/app/traces/page.tsx`.

- Compute `duration` per session from first→last event timestamps when fetching session detail (or expose from backend in `SessionSummary` — simpler: compute server-side and add to `SessionRow` as a method, surface in API).
- Add `errors_count` to `SessionSummary` server-side (count `event_type LIKE '%Error%'` per session). Backend tweak in `traces.py:list_sessions`.
- Add `<input type="search">` wired to `?search=` (uses A8).
- Inline title edit: click pencil → input → blur saves via new `PATCH /admin/api/v1/traces/sessions/{id}` endpoint (backend addition required — add to `traces.py` and `lib/api.ts`).

---

### B6. MCP transport selector + failure badge

**Spec ref:** §4.6 + D6.

**File:** `services/idun_agent_standalone_ui/app/admin/mcp/page.tsx`.

- Form: top-level `<select>` for `transport` (stdio | http | sse). Conditional fields: stdio → command + args; http/sse → url + headers.
- Badge: when `status === "failed"` from A7's API enrichment, show `<Badge tone="danger">failed</Badge>` next to the enabled/disabled badge.

---

### B7. Settings — session TTL editor

**Spec ref:** §4.6.

**File:** `services/idun_agent_standalone_ui/app/admin/settings/page.tsx`.

Add a "Sessions" Card:
- Number input bound to `IDUN_SESSION_TTL_SECONDS` (default 86400).
- Saved via new endpoint `PUT /admin/api/v1/settings/session-ttl` (or via env-var docs only — pick the lighter option).

**Pragmatic decision:** spec says session TTL belongs in settings, but it's an env var, not DB-backed. Show a read-only display of the current TTL ("Configured via `IDUN_SESSION_TTL_SECONDS`. Currently: 24h.") with a help tooltip pointing to the env var. No backend change.

---

### B8. Integrations — "Test webhook" action

**Spec ref:** §4.6.

**Files:**
- Backend: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/integrations.py` — add `POST /{id}/test` that calls `idun_agent_engine.integrations.<provider>.test_connection(config)` (engine support permitting; otherwise return 501 Not Implemented for MVP-1 with a clear UI message).
- UI: `app/admin/integrations/page.tsx` — "Test webhook" button per integration card. On click, POST and toast result.

**Pragmatic decision:** if engine has no `test_connection`, ship the button greyed out with `<ComingSoonBadge variant="preview" />`. Don't fake it.

---

### B9. Dashboard parity (1 chart + 1 list short)

**Spec ref:** §4.8 — *"4 KPI cards, 2 charts, 2 lists"*.

**File:** `services/idun_agent_standalone_ui/app/admin/page.tsx`.

Add a second chart ("Latency p50/p95/p99 — 7d") and a second list ("Recent errors") with mocked data + `<ComingSoonBadge variant="mocked"/>`. Convert KPI badges from raw `Badge tone="warning"` to `<ComingSoonBadge variant="mocked"/>`.

---

### B10. Inspector chat layout — implement or downgrade

**Spec ref:** §4.5.

**Decision:** implement for real — this is a headline differentiator.

**File:** `services/idun_agent_standalone_ui/components/chat/InspectorLayout.tsx`.

- Left: Same session-list dropdown as B4 (extracted into a reusable `<SessionList>` component).
- Right: Live event inspector — subscribe to the same `useChat` events and render the last N events with raw JSON view.

If time-constrained, fall back to: keep the placeholder labeled `<ComingSoonBadge variant="preview" />` and document in spec deviation log.

---

### B11. Traces session detail — 3-column layout + run brackets

**Spec ref:** §4.7.

**File:** `services/idun_agent_standalone_ui/app/traces/session/page.tsx`.

- Add left column: sessions sidebar (reuse `<SessionList>` from B10).
- Run brackets: group events by `run_id`, show "Run: {id} — {duration}" header.
- Tool calls as cards (already partially done — verify).
- Click event → inspector pane updates.

---

### B12. Cosmetics + Forks-from-here preview button

- Add Fork-from-here button in session detail header with `<ComingSoonBadge variant="preview"/>` and `disabled` (§9 surface).
- Replace KPI raw `<Badge>mocked</Badge>` with `<ComingSoonBadge variant="mocked"/>`.
- `MinimalLayout` should read `theme.appName` (currently hardcoded).
- Fix `ChatMessage.tsx:51` `any` → typed `Components["code"]`.

---

### B13. Tests: Vitest + Playwright bootstrap

**Spec ref:** §4.11 + spec §7.2.

**Files:**
- `services/idun_agent_standalone_ui/vitest.config.ts` (new) — Vitest with React Testing Library.
- `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` — at least one component test.
- `services/idun_agent_standalone_ui/playwright.config.ts` (new).
- `services/idun_agent_standalone_ui/e2e/{boot-standalone.sh, config.yaml, chat.spec.ts, admin-edit-reload.spec.ts, traces.spec.ts}` (new).
- `services/idun_agent_standalone_ui/package.json` — add `@playwright/test`, `vitest`, `@testing-library/react`, scripts `test`, `test:e2e`.

E2E specs:
- `chat.spec.ts` — load `/`, send "hello", assert assistant bubble appears.
- `admin-edit-reload.spec.ts` — login (none mode bypass), navigate to `/admin/agent/`, change name, save, assert success toast.
- `traces.spec.ts` — chat, navigate to `/traces/`, click first session, assert timeline renders.

---

## Wave C — Packaging, CI, Docs polish

### C1. Dockerfile.base local-source fallback (CRITICAL)

**Audit ref:** Step 1 of "Recommended sequencing".

**File:** `libs/idun_agent_standalone/docker/Dockerfile.base`.

**Approach:** wheel stage builds three wheels (engine, schema, standalone). Runtime stage installs all three from local wheels. No PyPI dependency.

```dockerfile
# ---- Wheel stage ----
FROM python:3.12-slim AS wheel
WORKDIR /build
RUN pip install --no-cache-dir uv

COPY libs/idun_agent_engine ./libs/idun_agent_engine
COPY libs/idun_agent_schema ./libs/idun_agent_schema
COPY libs/idun_agent_standalone ./libs/idun_agent_standalone

# Bring built UI into wheel source tree
COPY --from=ui /app/services/idun_agent_standalone_ui/out \
     ./libs/idun_agent_standalone/src/idun_agent_standalone/static

WORKDIR /build/libs/idun_agent_schema
RUN uv build --out-dir /dist
WORKDIR /build/libs/idun_agent_engine
RUN uv build --out-dir /dist
WORKDIR /build/libs/idun_agent_standalone
RUN uv build --out-dir /dist

# ---- Runtime ----
FROM python:3.12-slim AS runtime
...
COPY --from=wheel /dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/idun_agent_schema*.whl /tmp/idun_agent_engine*.whl /tmp/idun_agent_standalone*.whl && rm /tmp/*.whl
```

**Verify:** `docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t idun-agent-standalone:dev .` succeeds, then smoke test as in earlier audits.

---

### C2. Docker smoke job in CI

**File:** `.github/workflows/standalone-ci.yml`.

Add job:

```yaml
docker-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: docker/setup-buildx-action@v3
    - uses: pnpm/action-setup@v4
      with: { version: 9 }
    - uses: actions/setup-node@v4
      with: { node-version: "20", cache: "pnpm", cache-dependency-path: services/idun_agent_standalone_ui/pnpm-lock.yaml }
    - name: Build image
      run: docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t standalone:ci .
```

---

### C3. Playwright in CI

Add UI E2E job to `.github/workflows/standalone-ci.yml`:

```yaml
e2e:
  runs-on: ubuntu-latest
  defaults: { run: { working-directory: services/idun_agent_standalone_ui } }
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 9 }
    - uses: actions/setup-node@v4
      with: { node-version: "20", cache: "pnpm", cache-dependency-path: services/idun_agent_standalone_ui/pnpm-lock.yaml }
    - uses: actions/setup-python@v5
      with: { python-version: "3.12" }
    - run: pip install --no-cache-dir uv && uv sync --all-groups
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm test:e2e
```

---

### C4. Make targets `test-standalone` + `e2e-standalone`

**File:** `Makefile`.

```make
.PHONY: test-standalone e2e-standalone

test-standalone:
	uv run pytest libs/idun_agent_standalone/tests -q

e2e-standalone:
	cd services/idun_agent_standalone_ui && pnpm test:e2e
```

Add both to a comprehensive `make ci-standalone` target.

---

### C5. Compose example cleanup

**File:** `libs/idun_agent_standalone/docker-compose.example.yml`.

Remove obsolete `version: "3.9"` line.

---

### C6. Cloud Run example — Cloud SQL annotation

**File:** `libs/idun_agent_standalone/docker/cloud-run.example.yaml`.

Add `metadata.annotations`:
```yaml
metadata:
  name: my-agent
  annotations:
    run.googleapis.com/cloudsql-instances: PROJECT:REGION:idun-postgres
```

Keep the secret-driven `DATABASE_URL`. Document the URL form (`host=/cloudsql/...`) in `docs/standalone/cloud-run.mdx`.

---

### C7. UV workspace declaration (so `uv build --package idun-agent-standalone` works)

**File:** repo root `pyproject.toml`.

Add:

```toml
[tool.uv.workspace]
members = ["libs/idun_agent_engine", "libs/idun_agent_schema", "libs/idun_agent_standalone", "services/idun_agent_manager"]
```

This is the declarative way; `[tool.uv.sources]` already covers editable installs but doesn't constitute a "workspace". This is harmless and matches modern uv conventions.

---

### C8. Docs polish

- `docs/standalone/cloud-run.mdx` — show `cp /path/to/idun-agent-platform/.../cloud-run.example.yaml cloud-run.yaml` idiom.
- `docs/standalone/cli.mdx` (new) — single reference page for the 6 CLI commands. Add to `docs/docs.json` Standalone group.
- Add "Local development" section to overview or quickstart pointing at `make build-standalone-all` + `idun-standalone serve`.

---

### C9. CHANGELOG + version note

Update `libs/idun_agent_standalone/CHANGELOG.md` with the changes from this completion plan.

Bump `libs/idun_agent_standalone/pyproject.toml` to `0.1.0` (if not already) and tag `idun-agent-standalone-v0.1.0` only after C1–C8.

---

## Wave D — Final verification

### D1. Run the full backend test suite

```bash
uv run pytest libs/idun_agent_standalone/tests -q
uv run pytest libs/idun_agent_engine/tests/integration/server libs/idun_agent_engine/tests/unit/agent/test_observers.py -q
```

All green.

### D2. Build everything

```bash
make build-standalone-all
docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t standalone:final .
```

Both succeed. Wheel contains static UI; image boots and answers `/admin/api/v1/health`.

### D3. UI build + typecheck

```bash
cd services/idun_agent_standalone_ui
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

All green.

### D4. Real-agent smoke (Gemini + Langfuse)

Boot `idun-standalone serve` against the existing `/Users/geoffreyharrazi/Documents/GitHub/idun-agent-template/langgraph-simple/agent/agent.py:graph`, send a chat turn, verify trace lands in DB and Langfuse UI shows the run.

### D5. Final code review

Dispatch `superpowers:code-reviewer` on the completion plan's commits.

---

## Execution model

This plan will be executed via subagent-driven development:

- **Wave A (backend)**: one subagent, sequential tasks A1–A10. Acceptance gate: full pytest + lint pass.
- **Wave B (UI)**: one subagent, sequential tasks B1–B13. Acceptance gate: typecheck + build + Vitest + Playwright pass.
- **Wave C (ops)**: one subagent, tasks C1–C9 in parallel groups (Docker / CI / docs). Acceptance gate: Docker build smoke succeeds.
- **Wave D**: controller (this conversation) runs final verification + code review.

Commits per task with HEREDOC messages, `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
