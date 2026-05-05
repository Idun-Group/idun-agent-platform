# CLAUDE.md — Idun Agent Standalone UI

## What this is

A Next.js 15 + Tailwind v4 + React 19 SPA shipped as a static export. Bundled into the `idun-agent-standalone` Python wheel and served by FastAPI at `/`. Provides the chat surface and admin panel for a single-agent deployment.

## Routes

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
| `/admin/settings` | Theme + password sections — **runtime 404** (deferred backend; see "Half-migration state") |
| `/admin` | Dashboard with sessions list — **runtime 404** (sessions route deferred) |
| `/login` | Password sign-in — **runtime 404** (deferred backend) |
| `/traces`, `/traces/session` | Sessions list, run timeline, event detail — **runtime 404** (traces dropped from backend) |
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

## Half-migration state

`next.config.mjs` sets `typescript: { ignoreBuildErrors: true }`. This is intentional and temporary.

The Phase 6 UI rewrite migrated five admin pages (agent, memory, mcp, observability, prompts) to `lib/api/`, but several pages and components still reference the previous API client shape and the old backend features (auth login/logout/change-password, theme, traces sessions). Those pages typecheck-fail; the build flag lets the static export keep shipping.

`tsc --noEmit` lists the remaining gaps — fix or delete the broken references when:
- the corresponding backend feature returns (auth, theme, traces), or
- the deferred decision turns into "drop the page".

Once all pages compile, flip `ignoreBuildErrors` back to `false`.

## AG-UI

Hand-rolled SSE reader in `lib/agui.ts` — no `@ag-ui/client` dependency. Streams events from `/agent/run`, dispatches them into the chat store, and reconnects on transient failures. Keeps the bundle small.

The chat reducer (`lib/use-chat.ts`) handles both `THINKING_*` and `REASONING_*` event families so the UI works against engines on either side of the `ag-ui-langgraph` 0.0.35 protocol rename.

CUSTOM events with name `idun.a2ui.messages` are routed through the chat reducer into `Message.a2uiSurfaces`. `MessageView.tsx` renders one `<A2UISurfaceWrapper>` per surface, each wrapped in an `<A2UISurfaceErrorBoundary>`. Renderer is `@a2ui/react@^0.9.1` (subpath `/v0_9`); processor is per-message-per-surface and lives as long as the assistant message. Surface goes below the markdown text body. Render errors are silently absorbed (text stays visible, `console.error` for devs). Catalog: A2UI Basic v0.9. Styles auto-inject at runtime via `injectBasicCatalogStyles` inside the renderer — no explicit CSS import is needed at the app root (v0.9's `index.css` is not declared in the package's `exports` field, so importing it directly fails).

### A2UI actions (WS3)

`@a2ui/web_core/v0_9`'s `MessageProcessor` accepts a global `actionHandler`
at construction; `A2UISurfaceWrapper` installs one that calls
`useChat.sendAction(action, processor.getClientDataModel())`. The wrapper's
`isInteractive` prop (parent-computed: latest assistant message AND chat
status idle) gates clicks via two layers — CSS `pointer-events-none` and
a handler-side no-op guard.

`useChat.sendAction(action, dataModel?)` POSTs `/agent/run` with
`forwardedProps.idun.a2uiClientMessage` (+ optional
`a2uiClientDataModel`). No synthetic user message bubble is appended;
the existing streaming indicator gives feedback. Reentrancy is rejected
(no-op when `status !== "idle"`, plus a synchronous `sendActionInFlightRef`
to close the same-tick race).

The `ChatActionsContext.Provider` (wired in `MinimalLayout`,
`BrandedLayout`, `InspectorLayout`) exposes `sendAction` to deeply
nested wrappers without prop-drilling. The Provider value is memoized
via `useMemo([sendAction])` to avoid consumer churn on parent re-render.

Wire format alignment: `lib/agui.ts`'s `IdunA2UIMessage.updateDataModel`
uses the spec-correct `value: unknown` field (not `data`) per A2UI v0.9
`server_to_client.json#/$defs/UpdateDataModelMessage`. The engine's
envelope retrofit (T6) emits the same shape; mandatory schema validation
guarantees the contract.

## Build

```bash
cd services/idun_agent_standalone_ui
npm install
npm run build       # produces ./out (static export)
```

The repo Make target `build-standalone-ui` runs the build and copies `out/` into `libs/idun_agent_standalone/src/idun_agent_standalone/static/`.

## Conventions

- TypeScript strict mode; avoid `any` — read the source for the real type.
- Components are grouped by surface: `components/{ui,admin,chat,traces,common}/`.
- All fetches go through `lib/api/` — components never call `fetch` directly.
- Styles via Tailwind utilities + CSS variables; no styled-components.
