# Changelog — idun-agent-standalone

## 0.1.0 (2026-04-25)

### Added

- Initial public release.
- Single-process FastAPI app: `idun-standalone serve`.
- Chat UI (Next.js 15, three layout variants) at `/`.
- Admin panel at `/admin/` — agent config, guardrails, memory, observability, MCP, prompts, integrations, theme, settings.
- Traces viewer at `/traces/` — captures every AG-UI run event into a local DB.
- Auth ladder: `none` for laptop dev, `password` for containerized deploys (OIDC deferred to MVP-2).
- Multi-stage Dockerfile, docker-compose template, Cloud Run example.
- `idun-standalone init` scaffolds a working LangGraph agent project.
- Backed by SQLite by default; Postgres via `DATABASE_URL`.
- Hot-reload of the live agent via the admin UI; framework / graph-path changes require restart.
- APScheduler-based hourly retention purge of trace events.
- Bundled with `idun-agent-engine 0.6.x` (observer hook, pluggable reload auth, IDUN_UI_DIR static mount).
