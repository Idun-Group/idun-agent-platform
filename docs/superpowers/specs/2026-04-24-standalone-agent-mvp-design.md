# Standalone Agent MVP — Design Spec

| Field | Value |
|---|---|
| Status | Draft — pending approval |
| Date | 2026-04-24 |
| Author | Geoffrey Harrazi (h.geoffrey@idun-group.com) |
| Branch | `feat/standalone-agent-mvp` |
| Target ship | ~6–8 weeks (Cut Y — "Founder's edition") |
| Successor spec | MVP-2 (OIDC auth, real metrics/logs capture, pricing table, FTS, fork-from-here) |

## Executive Summary

Today, running an Idun agent in production requires two services (the engine + the manager) and a React governance UI. This MVP introduces **`idun-agent-standalone`** — a single-process, single-tenant deployment of one agent that ships with its own embedded chat UI, admin panel, and first-party traces viewer. A standalone agent runs self-sufficiently on a developer's laptop, a single VM, or Google Cloud Run. The existing manager + web UI continue as the multi-agent governance hub — unchanged.

The standalone is **architecturally new code, not a refactor of the hub**. It shares only the `idun_agent_schema` Pydantic models; it does not reuse the hub's React components, it does not bring the workspace/junction data model, and it does not modify the hub services. The engine itself receives three small, additive hooks so the standalone can compose on top cleanly.

## Goals

1. An operator can `pip install idun-agent-standalone` (or `docker run ghcr.io/idun-group/idun-agent-standalone`) and have a working agent with chat UI, admin panel, and traces viewer in under five minutes.
2. A single Docker image covers both VM and Cloud Run deployment, with config driven entirely by env vars.
3. The agent config (guardrails, MCP servers, memory, observability, prompts, integrations) is editable at runtime through the admin UI with hot-reload for non-structural changes.
4. A first-party traces viewer replays AG-UI run events per session — no dependency on Langfuse, Phoenix, or external observability to debug an agent.
5. The standalone can coexist with the governance hub: an operator can export a standalone's config as YAML and import it into the hub later (reverse path is deferred to MVP-3).

## Non-Goals

- Replacing or migrating the governance hub (`services/idun_agent_manager`, `services/idun_agent_web`). They stay on their current stack and release cadence.
- Multi-tenancy, workspaces, or multi-user admin on the standalone. A standalone deployment has **one agent and one admin account**.
- OIDC auth in MVP-1 (deferred to MVP-2).
- Real metrics capture (LLM tokens, cost estimates, graph-node timings) and real logs ingestion. MVP-1 ships UI shells for dashboard + logs labeled as "Coming soon — mocked data" (see §8 and §9).
- Langfuse/Phoenix replacement. The standalone's traces viewer covers AG-UI run events only; deeper LLM-level traces remain the job of external observability providers, which the engine still supports.

## Architectural Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | **Product shape: Shape 3** — engine-local store (SQLite/Postgres), shared Pydantic schemas with the manager, no workspace/junction tables | Reuse schemas (no drift), skip multi-tenant complexity, still portable to the hub via export |
| D2 | **Persona: C** — dev-first and deploy-first from the same codebase; auth ladder `none → password → OIDC` | Low bar for adoption + honest production story without bolting on later |
| D3 | **MVP cut: Y** — chat + full admin + traces viewer (AG-UI replay) + shell UIs for dashboard/logs | Traces viewer is the "self-sufficient" differentiator; OIDC + deeper metrics can follow |
| D4 | **Stack: fresh modern, do NOT migrate the hub** — Next.js 15 static export + React 19 + Tailwind v4 + shadcn/ui + pnpm | User directive; greenfield; Next.js static export matches customer-service-adk pattern |
| D5 | **Monorepo layout: Option A** — new `libs/idun_agent_standalone/` Python package + `services/idun_agent_standalone_ui/` Next.js app | Clean separation (engine stays lean SDK), monorepo cohesion for cross-cutting PRs |
| D6 | **MCP failure handling: warn and continue** — per-server try/except on reload; UI shows red badge on failed MCP cards | Surprises at Cloud Run deploy time are worse than reduced capability at runtime |
| D7 | **DB primary, YAML bootstrap** — on first boot, seed DB from `IDUN_CONFIG_PATH` YAML; subsequent boots read from DB | Single source of truth; admin edits don't fight a file |
| D8 | **Layout token in theme** — operator picks `branded` (default) / `minimal` / `inspector` | Same React app serves three chat UX modes — no fork |
| D9 | **"Coming soon" labeling rule** — all un-wired UI surfaces carry a visible `<ComingSoonBadge>` with `mocked` or `preview` variant | Roadmap legible to end users; prevents reliance on fake numbers |
| D10 | **Cancel in-flight streams on reload** — no resume semantics | Admin action is privileged and rare; resume is complexity we don't need for MVP-1 |
| D11 | **Framework or graph_definition changes require process restart** — admin API returns `202 { restart_required: true }` | Some engine state cannot be swapped in-process safely |

## §1 — Repository Layout & Packaging

```
idun-agent-platform/
├── libs/
│   ├── idun_agent_schema/              # unchanged
│   ├── idun_agent_engine/              # three additive hooks (see §2)
│   └── idun_agent_standalone/          # NEW — Python package
│       ├── pyproject.toml              # deps: idun-agent-engine, idun-agent-schema, sqlalchemy[asyncio], alembic, bcrypt, itsdangerous
│       ├── docker/
│       │   ├── Dockerfile.base         # published image
│       │   ├── Dockerfile.example      # how users extend it
│       │   └── cloud-run.example.yaml  # Cloud Run service spec
│       ├── docker-compose.example.yml  # multi-container flavor
│       ├── src/idun_agent_standalone/
│       │   ├── __init__.py
│       │   ├── cli.py                  # `idun standalone {serve,init,hash-password,export,import,db}`
│       │   ├── app.py                  # FastAPI composition (engine + admin + static UI + auth)
│       │   ├── settings.py             # Pydantic BaseSettings — env-driven config
│       │   ├── admin/
│       │   │   ├── routers/            # REST admin surface (see §3.3)
│       │   │   └── deps.py             # `require_auth` dependency
│       │   ├── db/
│       │   │   ├── base.py             # SQLAlchemy async; SQLite or Postgres
│       │   │   ├── models.py           # see §3.2
│       │   │   └── migrations/         # Alembic
│       │   ├── traces/
│       │   │   ├── capture.py          # AG-UI run-event observer; batched writer
│       │   │   └── replay.py           # event normalization for UI
│       │   ├── auth/
│       │   │   ├── password.py         # bcrypt + itsdangerous cookies
│       │   │   └── config.py           # resolves IDUN_ADMIN_AUTH_MODE
│       │   ├── reload.py               # orchestrator for live agent swap
│       │   ├── theme/
│       │   │   ├── models.py           # theme row
│       │   │   └── runtime_config.py   # generates /runtime-config.js
│       │   └── static/                 # populated at wheel-build time — the Next.js export
│       └── tests/                      # unit + integration + traces-capture
└── services/
    ├── idun_agent_manager/             # unchanged (governance hub)
    ├── idun_agent_web/                 # unchanged (governance hub UI)
    └── idun_agent_standalone_ui/       # NEW — Next.js 15 static export
        ├── package.json                # pnpm; next 15, react 19, tailwind v4, shadcn/ui, @ag-ui/client, react-hook-form, zod, @tanstack/react-query, zustand, recharts, @monaco-editor/react, lucide-react, sonner
        ├── next.config.js              # output: 'export'
        ├── app/
        │   ├── layout.tsx              # theme provider; CSS vars from /runtime-config.js
        │   ├── page.tsx                # / — chat UI (branded | minimal | inspector)
        │   ├── login/page.tsx          # password mode only
        │   ├── admin/
        │   │   ├── layout.tsx          # auth shell + sidebar
        │   │   ├── page.tsx            # Dashboard — UI SHELL, mocked (§9)
        │   │   ├── agent/page.tsx
        │   │   ├── guardrails/page.tsx
        │   │   ├── memory/page.tsx
        │   │   ├── observability/page.tsx
        │   │   ├── mcp/page.tsx
        │   │   ├── prompts/page.tsx
        │   │   ├── integrations/page.tsx
        │   │   └── settings/page.tsx
        │   ├── traces/
        │   │   ├── page.tsx            # session list
        │   │   └── [sessionId]/page.tsx
        │   └── logs/page.tsx           # UI SHELL, mocked (§9)
        ├── components/                 # shadcn primitives + app components
        └── lib/                        # api, hooks, theme, agui
```

**Build pipeline:**
1. `pnpm --filter idun_agent_standalone_ui build` → `services/idun_agent_standalone_ui/out/`
2. `make build-standalone-ui` copies `out/` → `libs/idun_agent_standalone/src/idun_agent_standalone/static/`
3. `uv build --package idun-agent-standalone` produces the wheel (hatch `force-include` bundles `static/`)
4. `docker/Dockerfile.base` is a thin layer on `python:3.12-slim` that `pip install`s the wheel.

**User extension pattern** (baked into docs):

```dockerfile
FROM ghcr.io/idun-group/idun-agent-standalone:0.6.0
COPY my_agent/ /app/agent/
ENV IDUN_CONFIG_PATH=/app/agent/config.yaml
```

## §2 — Upstream Changes to `idun_agent_engine`

Three additive, non-breaking changes. No changes to the engine's public config shape, CLI, or existing endpoints.

1. **Static UI mount via `IDUN_UI_DIR`** — upstream the pattern from the customer-service-adk patched engine.
   - `libs/idun_agent_engine/src/idun_agent_engine/server/app_factory.py`: if `IDUN_UI_DIR` env var is set and the path exists, mount `StaticFiles(directory=..., html=True)` at `/`.
   - Fallback: if the root route is already served, move the current info route to `/_engine/info`.
   - Also useful standalone-independently — anyone shipping a custom UI against the engine benefits.

2. **Pluggable auth for `/reload`** — fixes the open TODO at `routers/base.py:42`.
   - Add `reload_auth: Callable | None = None` kwarg to `create_app()`.
   - When `None` (current behavior): route is unprotected — documented as dev-only.
   - Standalone injects its `require_auth` dependency here.

3. **Run-event observer hook** — powers the traces viewer.
   - New API: `engine.register_run_event_observer(callback: Callable[[BaseEvent, RunContext], Awaitable[None]])`.
   - The SSE yielder in `/agent/run` calls each observer **before** encoding the event.
   - Observer exceptions caught and logged; they never break the SSE stream.

**Touched files:** `app_factory.py`, `routers/base.py`, `agent/runner.py` (wherever the SSE yielder lives), plus tests. Deprecation cleanup of `/agent/invoke`, `/agent/stream`, `/agent/copilotkit/stream` and CORS cleanup are not in MVP-1 scope.

## §3 — Standalone Python Package Internals

### §3.1 — Config source of truth

**DB is primary, YAML is bootstrap.** On first start with an empty DB, the standalone parses `IDUN_CONFIG_PATH` (default `./config.yaml` for dev, `/app/agent/config.yaml` in Docker) and seeds the DB. On subsequent starts the YAML is ignored — a one-line log warning is emitted if its hash differs from the bootstrap hash. Admin edits flow through the DB. `idun standalone export` dumps the current DB state as YAML for backup or hub-migration.

### §3.2 — DB schema

SQLAlchemy async, Alembic migrations. `DATABASE_URL` env var selects driver: default `sqlite+aiosqlite:///./idun_standalone.db`, Postgres via `postgresql+asyncpg://...`.

- `AgentRow(id="singleton", name, framework, graph_definition, config: JSONB, updated_at)`
- `GuardrailRow(id="singleton", config: JSONB, enabled)`
- `MemoryRow(id="singleton", config: JSONB)`
- `ObservabilityRow(id="singleton", config: JSONB)`
- `McpServerRow(id: uuid, name, config: JSONB, enabled)` — many
- `PromptRow(id, prompt_key, version, content, tags: JSONB, created_at)` — many, append-only
- `IntegrationRow(id, kind: "whatsapp" | "discord", config: JSONB, enabled)` — many
- `ThemeRow(id="singleton", config: JSONB)` — layout token, colors, logo, typography, starter prompts
- `SessionRow(id: threadId, created_at, last_event_at, message_count, title: nullable)`
- `TraceEventRow(id: autoinc, session_id, run_id, sequence, event_type, payload: JSONB, created_at)`
- `AdminUserRow(id="admin", password_hash, password_rotated_at)` — password mode only

No workspace or junction tables. JSONB on SQLite is `JSON` (SQLAlchemy handles).

### §3.3 — Admin REST surface

All routes under `/admin/api/v1/*`; all guarded by the single `require_auth` dep (no-op in `none` mode).

```
POST   /auth/login                        # password mode
POST   /auth/logout
GET    /auth/me

GET    /agent
PUT    /agent                             # triggers reload
POST   /agent/reload                      # force reload without changes

GET/PUT /guardrails
GET/PUT /memory
GET/PUT /observability
GET/PUT /theme

GET    /mcp-servers
POST   /mcp-servers
GET    /mcp-servers/{id}
PATCH  /mcp-servers/{id}
DELETE /mcp-servers/{id}

GET    /prompts
POST   /prompts
GET    /prompts/{id}
DELETE /prompts/{id}

GET    /integrations
POST   /integrations
PATCH  /integrations/{id}
DELETE /integrations/{id}

GET    /traces/sessions                   # paginated
GET    /traces/sessions/{id}
GET    /traces/sessions/{id}/events
DELETE /traces/sessions/{id}

GET    /health
GET    /config/export
```

### §3.4 — Auth (password mode)

- `IDUN_ADMIN_AUTH_MODE` ∈ `{none, password}`. Default: `none` outside a container (heuristic: `IDUN_IN_CONTAINER=1` baked into the Docker image); `password` inside.
- `IDUN_ADMIN_PASSWORD_HASH` — bcrypt hash. `idun standalone hash-password` prints one. Startup fails if password mode and no hash.
- `IDUN_SESSION_SECRET` — 32+ char HMAC key for cookie signing. Auto-generated in `none`; **required** in `password` (startup fails if missing).
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS (detected via `X-Forwarded-Proto` with `trusted_proxies`).
- TTL: `IDUN_SESSION_TTL_SECONDS` (default 86400). Sliding expiry when within 10% of TTL.
- Chat UI `/` is always public in MVP-1.

### §3.5 — Traces capture

- Registered via `engine.register_run_event_observer(traces_observer)` (§2 #3) at startup.
- Session id = AG-UI `threadId` (from `RunAgentInput`). Run id = AG-UI `runId`.
- **Batched async writer**: batches 25 events or 250 ms latency, whichever first. DB writes never block SSE.
- Writer failures logged, counter incremented, never propagated.
- First event for a new `threadId` upserts `SessionRow`. `last_event_at` and `message_count` updated on each flush.
- Retention: `IDUN_TRACES_RETENTION_DAYS` (default 30). In-process APScheduler purges hourly on long-running deploys; on Cloud Run (scale-to-zero), purge is **opportunistic** on request — MVP-1 skips this with a documented caveat.

### §3.6 — Reload orchestration

Triggered by `PUT /admin/api/v1/agent`, any singleton `PUT`, MCP CRUD, or `POST /agent/reload`:

1. Validate payload against `idun_agent_schema` models → 400 on failure.
2. Read current `EngineConfig` from DB into memory as `previous_config` (for recovery).
3. Begin transaction; write updated row(s); commit.
4. Detect **structural changes** (framework or graph_definition path changed):
   - If yes: return `202 { restart_required: true }`. Config is persisted; live agent unchanged. Admin UI shows a persistent banner.
5. Otherwise assemble the new `EngineConfig` from DB.
6. `engine.shutdown_agent()` — cancels in-flight streams (D10).
7. `engine.initialize(new_config)` — re-init adapter, guardrails, MCP, observability.
8. Re-attach the run-event observer to the new agent.
9. On init failure in step 7: attempt `engine.initialize(previous_config)` as a recovery step:
   - Recovery succeeds → return `500 { error: "engine_init_failed", message, recovered: true }`. Old agent is live again; admin fixes config and retries.
   - Recovery fails → return `500 { error: "engine_init_failed", message, recovered: false }`. Agent is down; UI shows a "requires restart" banner; operator fixes external state (env var, file) and restarts the container.
10. **MCP failures** during step 7 (D6): per-server try/except; agent continues with reduced tools; UI shows a red badge on failed MCP cards.

### §3.7 — CLI

```
idun standalone init [NAME]        # scaffold new agent project
idun standalone serve              # run the app
idun standalone hash-password      # print bcrypt hash for IDUN_ADMIN_PASSWORD_HASH
idun standalone export             # dump DB → YAML (stdout)
idun standalone import FILE        # load YAML → DB (overwrites)
idun standalone db migrate         # alembic upgrade head
```

`serve` flags (most also env vars prefixed `IDUN_`): `--config` (`IDUN_CONFIG_PATH`), `--host` (`IDUN_HOST`), `--port` (`IDUN_PORT`), `--auth-mode` (`IDUN_ADMIN_AUTH_MODE`), `--ui-dir` (`IDUN_UI_DIR`). Exception: `--database-url` maps to the conventional `DATABASE_URL` (no `IDUN_` prefix).

### §3.8 — App factory

```python
def create_standalone_app(settings: StandaloneSettings) -> FastAPI:
    engine_config = assemble_engine_config_from_db_or_yaml(settings)
    app = create_engine_app(engine_config, reload_auth=admin_auth_dep)
    app.state.standalone_settings = settings
    app.state.db = create_async_engine(settings.database_url)

    register_admin_routers(app)
    register_runtime_config_route(app)    # /runtime-config.js
    attach_traces_observer(app.state.engine)
    mount_static_ui(app, settings.ui_dir)  # / → bundled Next.js export (or IDUN_UI_DIR override)

    return app
```

## §4 — Standalone UI

### §4.1 — Routes

```
/                           # chat (branded | minimal | inspector via theme token)
/login                      # password mode only
/admin                      # Dashboard — UI SHELL, mocked (§9)
/admin/agent                # agent config (form + YAML preview)
/admin/guardrails
/admin/memory
/admin/observability
/admin/mcp
/admin/prompts
/admin/integrations
/admin/settings             # theme editor + admin password + session TTL
/traces                     # session list
/traces/[sessionId]         # timeline + event inspector (+ waterfall toggle — preview, §9)
/logs                       # UI SHELL, mocked (§9)
```

Three layouts:
- Chat layout (`/`) — no chrome.
- Auth shell (`/admin/*`, `/traces/*`, `/logs`) — left sidebar nav + topbar.
- Centered card (`/login`).

### §4.2 — Stack

Next.js 15 App Router + `output: 'export'`, React 19, Tailwind v4 (CSS variables for theme), shadcn/ui primitives (committed to repo), @tanstack/react-query for data, Zustand for UI state, react-hook-form + zod for forms, Recharts for charts, @monaco-editor/react (dynamic-imported on `/admin/*`), @ag-ui/client, lucide-react, sonner for toasts.

**Types generated from FastAPI's OpenAPI via `openapi-typescript`**: `pnpm generate:types` — same pattern as the hub.

### §4.3 — Runtime config injection

Static export can't embed backend values at build. Pattern:
- FastAPI serves `GET /runtime-config.js` ahead of the static mount.
- The script sets `window.__IDUN_CONFIG__ = { theme, appName, authMode, layout, ... }`.
- `app/layout.tsx` loads it via `<Script strategy="beforeInteractive">`.
- Client reads `window.__IDUN_CONFIG__` at first paint — no loading flash.

### §4.4 — Theme (design options)

Config (stored in `ThemeRow.config`, served via `/runtime-config.js`):

```ts
type ThemeConfig = {
  appName: string;
  greeting: string;
  starterPrompts: string[];           // max 4
  logo: { text: string; imageUrl?: string };  // base64 data URL, ≤ 256 KB, MVP-1
  layout: 'branded' | 'minimal' | 'inspector';  // D8
  colors: {
    light: { primary, accent, background, foreground, muted, border };
    dark:  { primary, accent, background, foreground, muted, border };
  };
  radius: '0' | '0.25' | '0.5' | '0.75' | '1';
  fontFamily: 'system' | 'inter' | 'geist' | 'jetbrains-mono';
  defaultColorScheme: 'light' | 'dark' | 'system';
};
```

Presets: Default / Corporate / Midnight / Warm — seed the editor; operator tweaks from there. Applied as CSS custom properties on `<html>` on first paint; edits take effect without a rebuild.

### §4.5 — Chat UI (`/`)

- Welcome: logo + greeting + up to 4 starter-prompt pills.
- Streaming rendering of AG-UI events:
  - `TextMessageStart/Content/End` → bubble.
  - `ToolCallStart/Args/End` → collapsible tool card.
  - `ThinkingStart/End` → collapsible thinking block.
- Stop button mid-stream → AG-UI cancellation.
- Session switcher: last 10 sessions by `last_event_at`; "New session" creates a new `threadId` (UUID v4, persisted in URL `?session=<uuid>` for shareable links).
- Layout variants driven by `theme.layout`:
  - `branded` (default): branded header, quick-reply chips, warmer visual language.
  - `minimal`: Claude-style centered input, no sidebar.
  - `inspector`: sidebar session history + right-side live event inspector.

### §4.6 — Admin editors (forms-first)

Per-resource pattern:
- Structured form widgets via react-hook-form + zod (schemas derived from `idun_agent_schema`).
- Read-only YAML preview via Monaco below the form; "Edit YAML" toggles to full editor — both bound to the same DB row, kept in sync.
- "Save & reload" button in the topbar; dirty indicator ( ● Unsaved ) when changes pending.
- On save: `PUT` → reload toast → TanStack Query invalidations.
- Graph / framework edits show a persistent "restart required" banner.

Per-page specifics:
- **Agent**: identity (name, framework, graph_definition path) + advanced YAML.
- **Guardrails / Memory / Observability**: provider-specific form + JSON escape hatch.
- **MCP**: card grid with add/edit Sheet; transport selector (stdio / http / sse); red badge on failed servers (D6).
- **Prompts**: versioned list, Monaco editor with Jinja2 variable detection (regex-based).
- **Integrations**: WhatsApp + Discord config forms with "Test webhook" action.
- **Settings**: theme editor (colors, radius, font, logo, layout, starter prompts), admin password change, session TTL.

### §4.7 — Traces viewer

**Session list** (`/traces`): paginated table (id, title editable inline, created, messages, last event, duration, errors badge). Date-range filter, delete action.

**Session detail** (`/traces/[sessionId]`): three columns —
- Left: sessions sidebar (search + row list).
- Middle: timeline grouped by run:
  - `RunStarted → RunFinished` = run bracket with duration.
  - Text events merged into assistant message bubbles.
  - Tool calls as cards (name, args JSON, duration).
  - Thinking blocks collapsible.
  - StepStarted = step header.
- Right: event inspector — click any event → structured metadata + raw JSON.
- Top: event-type filter chips (All / Messages / Tools / Thinking / Errors); text search (server-side `LIKE` in MVP-1).
- **Waterfall toggle** present but shows a "Coming in MVP-2" preview panel (§9).

### §4.8 — Dashboard (SHELL only in MVP-1)

Page renders with mocked data + a prominent `<ComingSoonBadge variant="mocked" />` in each KPI card and chart title bar. Visual layout is finalized (4 KPI cards, 2 charts, 2 lists) so MVP-2 only wires the data.

### §4.9 — Logs (SHELL only in MVP-1)

Same principle: live-tail UI with mocked stream, `<ComingSoonBadge variant="mocked" />` in the toolbar. Filter chips, search, pause/clear controls all render but don't affect real data.

### §4.10 — Build & bundle

- `pnpm install && pnpm build` → `out/`.
- Monaco dynamic-imported on `/admin/*` only (chat ships without it — ~200 KB JS vs ~3 MB).
- Make target: `make build-standalone-ui` copies `out/` into the Python package's `static/`.

### §4.11 — Testing

- Unit: Vitest for hooks, theme resolver, API wrappers.
- Component: React Testing Library (ChatStream, ConfigEditor, TraceTimeline).
- E2E: Playwright — login → admin nav → edit config → reload → chat works → trace appears. ~8 scenarios, one per route.

## §5 — Data Flow

### §5.1 — First boot

1. CLI runs `alembic upgrade head`.
2. CLI queries `AgentRow` — if empty, reads `IDUN_CONFIG_PATH` YAML, seeds all resource tables in one transaction.
3. CLI assembles `EngineConfig` from DB → `create_engine_app(config, reload_auth=...)`.
4. CLI registers traces observer via `engine.register_run_event_observer(...)`.
5. CLI mounts `/admin/api/v1/*` routers, `/runtime-config.js`, and static UI.
6. uvicorn listens on `IDUN_PORT` (default 8000).

### §5.2 — Admin login (password mode)

1. Browser `GET /login` → static HTML.
2. Browser `GET /runtime-config.js` → `{ authMode: "password" }`.
3. User submits form → `POST /admin/api/v1/auth/login { password }`.
4. Router `bcrypt.check` → signs `sid` cookie via `itsdangerous`.
5. Browser redirects to `/admin` (or `returnTo`).
6. All subsequent admin requests verified by `require_auth` dep; sliding expiry re-signs cookies near TTL.

### §5.3 — Chat turn

1. Browser mints UUID v4 → `threadId`.
2. Browser `POST /agent/run { threadId, runId, messages, state }` via @ag-ui/client.
3. Engine SSE yielder: for each event, invokes every registered run-event observer before encoding.
4. Standalone observer enqueues `TraceEvent(session_id=threadId, run_id=runId, seq=..., payload=event.model_dump())` in the batched writer.
5. Batched writer flushes every 25 events or 250 ms.
6. Browser renders events live; on RunFinished, re-enables input.
7. Observer failures logged, metric incremented, stream continues.

### §5.4 — Admin edit → reload

1. Browser `PUT /admin/api/v1/<resource> { new_config }`.
2. Router validates against `idun_agent_schema` → 400 on failure.
3. Router captures `previous_config` from DB for recovery.
4. Router writes new state in a txn and commits.
5. Router calls `reload.orchestrate(changed_fields, previous_config)`:
   - Structural change → `202 { restart_required: true }`.
   - Otherwise: shutdown → initialize(new) → re-attach observer.
   - On init failure: attempt `initialize(previous_config)`; response includes `recovered: true | false`.
6. Browser toast + TanStack Query invalidations on 200; banner on 202; error toast with request_id on 500.

### §5.5 — Trace replay

1. Browser `GET /admin/api/v1/traces/sessions?limit=50&offset=0` → table renders.
2. Click a session → `GET /admin/api/v1/traces/sessions/{id}/events` → full JSON.
3. Client groups events by `run_id`, renders timeline.
4. Click an event → inspector updates client-side (no fetch).
5. Delete session → `DELETE .../{id}` → cascades to events.

### §5.6 — Theme edit

1. User edits colors/radius/logo on `/admin/settings` → Zustand live preview.
2. Save → `PUT /admin/api/v1/theme`.
3. Browser reloads `/runtime-config.js` → fresh CSS vars applied to `<html>`.
4. No engine restart.

## §6 — Auth Ladder

| Mode | Chat UI | Admin + Traces + Logs | Secrets | Use |
|---|---|---|---|---|
| `none` | public | open | — | laptop dev (default outside container) |
| `password` | public | password gate + session cookie | `IDUN_ADMIN_PASSWORD_HASH`, `IDUN_SESSION_SECRET` | VM / Cloud Run / container (default inside) |
| `oidc` | public (same as password mode) | OIDC IdP + session cookie | issuer/client_id/client_secret | MVP-2 |

Startup fails fast on missing required secrets. Password change invalidates all existing sessions by stamping `password_rotated_at` and rejecting cookies issued before it.

## §7 — Error Handling & Testing

### §7.1 — Error handling

- FastAPI global exception handlers: ValidationError → 400; SQLAlchemyError → 500 (internals hidden); EngineInitError → 500 (message exposed — admins need it); AuthRequired → 401; `Exception` catch-all → 500.
- Every response carries `X-Request-Id` (ContextVar) — referenced in logs and UI toasts.
- Reload rollback: new-config init failure rolls back DB txn and keeps old agent running.
- Traces observer failures: caught inside wrapper, `logger.exception`, `traces_write_failures_total` incremented, stream unaffected.
- MCP failures on reload (D6): per-server try/except → warning log → reduced toolset → red badge in UI.
- Startup failures: fail fast; no "degraded mode."

### §7.2 — Testing

| Level | Scope | Tool |
|---|---|---|
| Unit | Pure functions, schema validation, config assembly, reload orchestrator | pytest |
| Integration | Admin router ↔ SQLite ↔ engine init cycle (mocked EchoAgent) | pytest + httpx.AsyncClient |
| Traces capture | Scripted AG-UI event sequence → assert DB rows | pytest |
| Smoke Docker | Build base image → `/health` + `/agent/capabilities` | CI matrix |
| E2E | Playwright: login → edit → reload → chat → trace (~8 scenarios) | Playwright |

Fixtures: `standalone_app` (in-memory SQLite + `EchoAgent`), `authed_client` (pre-baked session), `fake_run` (scripted AG-UI events).

CI: `make test-standalone`, `make e2e-standalone`, added to `make ci` as a matrix job (python-3.12, node-20, with-postgres / without).

## §8 — Out-of-Scope for MVP-1

### §8.1 — Deferred to MVP-2

- OIDC auth
- Real metrics + logs capture (LangChain callback, `llm_calls` / `graph_steps` / `log_entries` tables, live log SSE)
- Static model pricing table + cost estimates
- Traces full-text search (SQLite FTS5 / Postgres GIN)
- "Fork from here" trace replay
- Scheduled trace retention purge (Cloud Run limits; currently only long-running purges work)
- `next-intl` / i18n
- Chat UI auth gate (`IDUN_CHAT_AUTH_MODE`)

### §8.2 — Deferred to MVP-3+

- Hub adoption / import from standalone (MVP-1 ships one-way `export` CLI)
- Multi-user admin / invites / RBAC
- Admin audit log

### §8.3 — Explicitly not in the standalone product

- Workspaces / multi-tenancy — by design; standalone = single-tenant. Use the hub for many.
- Rate limiting on `/agent/run`
- Agent-side streaming resume after reload
- Auto-upgrade DB schemas across major versions (operators run `idun standalone db migrate`)
- Bundled Postgres — users bring their own

## §9 — "Coming Soon" Labeling Rule

All UI surfaces shipping without wired-up data MUST display a visible `<ComingSoonBadge>` component:

- `variant="mocked"` — the surface is fully rendered with fake data. Badge text: "Coming soon — mocked data".
- `variant="preview"` — the surface exists as a toggle or container but contains only an explanatory placeholder. Badge text: "Preview — available in MVP-2".

Placement convention: top-right of the affected card or page title bar. Badge styling matches the theme's warning accent.

MVP-1 surfaces with the rule applied:
- `/admin` (Dashboard) → `mocked` on every KPI and chart.
- `/logs` → `mocked` on the toolbar.
- `/traces/[id]` waterfall toggle → `preview`.
- Fork-from-here button → `preview`.
- Any other non-wired data discovered during implementation: same rule.

## Appendix A — Decision Log (chronological)

| Q | Decision | Section |
|---|---|---|
| Q1 — MVP shape | D. Chat + admin + traces viewer | D3 |
| Q2 — Product shape | 3. Shared schemas, engine-local store, no workspaces | D1 |
| Q3 — Deployment topology | C. Dev + deploy from same codebase; auth ladder | D2 |
| Q4 — MVP cut line | Y. Founder's edition (includes traces viewer) | D3 |
| Q5 — UI stack | Fresh modern; Next.js 15 + Tailwind v4 + shadcn/ui; do not migrate hub | D4 |
| Q6 — Repo layout | A. New `libs/idun_agent_standalone/` + `services/idun_agent_standalone_ui/` | D5 |
| Q7 — MCP failure handling | C. Warn and continue | D6 |
| — | Traces batch size 25 / 250 ms | §3.5 |
| — | Cancel in-flight on reload | D10 |
| — | Metrics + logs capture SCOPE PULL-BACK | §8.1, §9 |
| — | Coming-soon labeling rule | D9, §9 |
| Chat mock | Branded default; minimal + inspector via theme layout token | D8 |
| Admin mock | Forms-first; YAML as read-only preview | §4.6 |
