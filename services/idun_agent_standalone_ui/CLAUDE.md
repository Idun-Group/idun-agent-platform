# CLAUDE.md — Idun Agent Standalone UI

## What this is

A Next.js 15 + Tailwind v4 + React 19 SPA shipped as a static export. Bundled into the `idun-agent-standalone` Python wheel and served by FastAPI at `/`. Provides the chat surface and admin panel for a single-agent deployment.

## Routes

<!-- VERIFY: regenerate from services/idun_agent_standalone_ui/app/ -->

| Route | Status |
| --- | --- |
| `/` | Chat UI; layout switched at runtime (branded / minimal / inspector) |
| `/admin/agent` | Agent identity + base config — wired to `/admin/api/v1/agent` |
| `/admin/memory` | Memory singleton — wired to `/admin/api/v1/memory` |
| `/admin/guardrails` | Guardrails collection — wired to `/admin/api/v1/guardrails` |
| `/admin/mcp` | MCP servers collection — wired to `/admin/api/v1/mcp-servers` |
| `/admin/observability` | Observability singleton — wired to `/admin/api/v1/observability` |
| `/admin/integrations` | Integrations collection — partially migrated; still references the old `kind` field |
| `/admin/prompts` | Prompts versioned collection — wired to `/admin/api/v1/prompts` |
| `/admin/traces` | Trace list with cursor pagination + filter Selects (auto-populated from observed values) — wired to `/admin/api/v1/traces` |
| `/admin/traces/[traceId]` | Trace detail: header metric strip, span tree (W3C ARIA, ↑↓→← keyboard nav), waterfall (sticky time-axis ruler, ↑↓ keyboard nav, root-to-leaf critical-path emphasis), span-detail rail (Info/Tool/Input/Output/Attributes/Events tabs with Pretty/Raw segmented control + JSON dark theme + Copy-all). Wired to `/admin/api/v1/traces/{trace_id}`. URL-stateful via `?view=tree|waterfall&span=<id>`. Mobile (<lg) renders the rail as a Sheet. |
| `/admin/settings` | Theme + password sections — **runtime 404** (deferred backend; see "Deferred features") |
| `/admin` | Dashboard landing — reuses ConnectionCard, ConfigurationDisplay (read-only), and AgentGraphLazy from the agent page, plus five trace-driven activity widgets backed by `/admin/api/v1/dashboard`. URL-stateful `?range=1h\|24h\|7d\|30d` (default `24h`), 60 s auto-refresh. |
| `/login` | Password sign-in — **runtime 404** (SPA wiring deferred; standalone backend exists) |
| `/logs` | Live tail of recent events — **runtime 404** (no backend route) |

## Theme

CSS variables driven at runtime via `/runtime-config.js`, served by the standalone backend (`runtime_config.py`). `ThemeLoader` reads the runtime config in the document head before first paint, applies the variables, and exposes `authMode` to the rest of the app. Light/dark palettes, radius, font, app name, greeting, layout, and starter prompts are all theme-driven — no rebuild required to rebrand.

There is no admin route to mutate the theme yet; the bootstrap exposes a hardcoded default. A theme admin endpoint is deferred.

## API client

All admin calls go through `lib/api/`:

- `lib/api/client.ts` — `apiFetch<T>` wrapper. Every request sets `credentials: include` so a future session cookie travels with it. 401 redirects to `/login/` once.
- `lib/api/index.ts` — the `api` object exporting one method per endpoint. Endpoints map 1:1 to `/admin/api/v1/*`.
- `lib/api/types/{agent,common,guardrails,integrations,mcp,memory,observability,prompts,sessions}.ts` — typed request/response models that mirror the standalone admin schemas (camelCase wire keys).

Errors are normalized to `ApiError` with `status` and `detail` fields.

## AG-UI

Hand-rolled SSE reader in `lib/agui.ts` — no `@ag-ui/client` dependency. Streams events from `/agent/run`, dispatches them into the chat store, and reconnects on transient failures. Keeps the bundle small.

## Build

```bash
cd services/idun_agent_standalone_ui
pnpm install
pnpm build          # produces ./out (static export)
```

The repo Make target `build-standalone-ui` runs the build and copies `out/` into `libs/idun_agent_standalone/src/idun_agent_standalone/static/`.

## Tests

```bash
cd services/idun_agent_standalone_ui

pnpm typecheck                 # tsc --noEmit (currently leaks via ignoreBuildErrors — see Deferred)
pnpm test                      # vitest unit tests
pnpm test:e2e                  # playwright; auto-boots the standalone server
pnpm build                     # static export → ./out
```

Unit tests live in the top-level `__tests__/` directory, organized by surface (`__tests__/api/`, `__tests__/onboarding/`, `__tests__/tour/`, plus component-level files at the root). End-to-end tests live in `e2e/`; the suite uses `e2e/boot-standalone.sh` to start a real Python standalone process before driving the browser.

## Conventions

- TypeScript strict mode; avoid `any` — read the source for the real type.
- Components are grouped by surface: `components/{ui,admin,chat,traces,common}/`.
- All fetches go through `lib/api/` — components never call `fetch` directly.
- Styles via Tailwind utilities + CSS variables; no styled-components.

## Deferred features

| Page / feature | Status | Notes |
| --- | --- | --- |
| `/admin/settings` (theme + password) | Runtime 404 | Backend deferred. Page references will typecheck-fail until restored or deleted. |
| `/login` password sign-in | Runtime 404 | Standalone backend implements password auth in strict-minimum scope; the SPA login page wiring is on a separate branch. |
| `/logs` live tail | Runtime 404 | No backend route. |
| `/admin/integrations` (still uses old `kind` field) | Half-migrated | Update to current `IntegrationConfig` shape when revisiting messaging integrations. |

`next.config.mjs` sets `typescript: { ignoreBuildErrors: true }` to allow shipping while these gaps exist. `tsc --noEmit` lists the remaining gaps. Flip the flag back to `false` once every page above is either restored or deleted.

## Telemetry

### Architecture
- Module: `lib/telemetry/` (mirrors `libs/idun_agent_engine/src/idun_agent_engine/telemetry/`)
- Provider: `components/providers/PostHogProvider.tsx` mounted once in `app/layout.tsx`
- Runtime config: `window.__IDUN_CONFIG__.telemetry`, populated server-side by `libs/idun_agent_standalone/src/idun_agent_standalone/runtime_config.py`

### Off-switch
`IDUN_TELEMETRY_ENABLED=false` on the server kills both Python engine telemetry and browser telemetry. Two sub-knobs:
- `IDUN_TELEMETRY_IDENTIFY_USERS=false` — keep browser events anonymous (no `identify(email)`)
- `IDUN_TELEMETRY_SESSION_REPLAY=false` — analytics on, replay off

### Event taxonomy (canonical)

| Event | Surface | Properties |
|---|---|---|
| `auth.login.start` | login form / OIDC button | `method`, `provider?` |
| `auth.login.success` | callback | `method`, `provider?`, `duration_ms` |
| `auth.login.failure` | callback | `method`, `provider?`, `duration_ms`, `error_class` |
| `auth.logout` | topbar logout | `method` |
| `agent.config.saved` | admin save handlers | `agent_id`, `section`, `duration_ms`, `result` |
| `agent.config.reloaded` | admin reload button | `agent_id`, `duration_ms`, `result` |
| `agent.run.started` | `useChat.send` | `agent_id`, `session_id`, `message_index` |
| `agent.run.completed` | `useChat` on RUN_FINISHED | `agent_id`, `session_id`, `duration_ms` |
| `agent.run.error` | `useChat` catch | `agent_id`, `session_id`, `error_class`, `duration_ms` |
| `chat.message.sent` | `ChatInput` submit | `session_id`, `length_chars`, `length_words` |
| `chat.response.received` | first TEXT_MESSAGE_CONTENT delta | `session_id`, `time_to_first_token_ms` |
| `chat.message.retried` | retry button | `session_id`, `attempt_number` |
| `chat.error` | error toast | `session_id`, `error_class`, `recoverable` |

### Masking convention
- `data-ph-mask` — text contents replaced in replay (chat textarea, auth forms)
- `data-ph-no-capture` — whole subtree blocked from replay (message bubbles, prompts editor)
- All `<input>`/`<textarea>` are masked by default via `maskAllInputs: true`

### Required-on-review checklist
- New button/route/form handler? → Does it call `capture(Events.X, {...})` from `lib/telemetry`?
- New input receiving user content? → Does the JSX have `data-ph-mask` (or `data-ph-no-capture` for whole-subtree block)?
- New event name? → Added to `lib/telemetry/events.ts` AND this table AND `docs/observability/telemetry-events.mdx` in the same PR?

PRs that add a new user-visible flow without telemetry are rejected at review.
