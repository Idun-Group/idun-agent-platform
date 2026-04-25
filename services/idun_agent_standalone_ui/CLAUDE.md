# CLAUDE.md — Idun Agent Standalone UI

## What this is

A Next.js 15 + Tailwind v4 + React 19 SPA shipped as a static export. Bundled into the `idun-agent-standalone` Python wheel and served by FastAPI at `/`. Provides the chat surface, admin panel, and traces viewer for a single-agent deployment.

## Routes

- `/` — chat UI; layout switched at runtime (branded / minimal / inspector).
- `/login` — password sign-in (only reachable when `auth_mode = password`).
- `/admin/*` — agent, guardrails, memory, observability, MCP, prompts, integrations, theme, settings editors.
- `/traces/*` — sessions list, run timeline, event detail.
- `/logs` — live tail of recent events.

## Theme

CSS variables driven at runtime via `/runtime-config.js`, served by the standalone backend. `ThemeLoader` reads the runtime config in the document head before first paint, applies the variables, and exposes the `auth_mode` to the rest of the app. Light/dark palettes, radius, font, app name, greeting, layout, and starter prompts are all theme-driven — no rebuild required to rebrand.

## API client

All admin calls go through `lib/api.ts`. Every request sets `credentials: include` so the session cookie travels. Endpoints map 1:1 to `/admin/api/v1/*`. Errors are normalized to `ApiError` with `status` and `detail` fields.

## AG-UI

Hand-rolled SSE reader in `lib/agui.ts` — no `@ag-ui/client` dependency. Streams events from `/agent/run`, dispatches them into the chat store, and reconnects on transient failures. Keeps the bundle small.

## Build

```bash
cd services/idun_agent_standalone_ui
pnpm install
pnpm build       # produces ./out (static export)
```

The repo Make target `build-standalone-ui` runs the build and copies `out/` into `libs/idun_agent_standalone/src/idun_agent_standalone/static/`.

## Conventions

- TypeScript strict mode; avoid `any` — read the source for the real type.
- Components are grouped by surface: `components/{ui,admin,chat,traces,common}/`.
- All fetches go through `lib/api.ts` — components never call `fetch` directly.
- Styles via Tailwind utilities + CSS variables; no styled-components.
