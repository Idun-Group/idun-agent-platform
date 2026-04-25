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

### Packaging & ops (Wave C)

- `Dockerfile.base` builds wheels for `idun-agent-schema`, `idun-agent-engine`, and `idun-agent-standalone` from local sources and installs all three into the runtime stage. The image no longer depends on the standalone wheel being on PyPI before the first release.
- `standalone-ci.yml` adds two jobs: `docker-smoke` builds the runtime image and asserts `/admin/api/v1/health` returns 200; `e2e` runs the Playwright suite against a booted standalone.
- New Make targets: `make test-standalone`, `make e2e-standalone`, `make ci-standalone`.
- `docker-compose.example.yml` drops the obsolete `version: "3.9"` key (Compose v2 ignores it).
- `cloud-run.example.yaml` documents the required `run.googleapis.com/cloudsql-instances` annotation at both the service and the revision level so Cloud SQL unix-socket DSNs work out of the box.
- Repo root `pyproject.toml` declares the four packages as a uv workspace, so `uv build --package idun-agent-standalone` works from the repo root.
- New docs page: `/standalone/cli` — single reference for the six CLI commands and every env var. Quickstart now has a "Local development from a checkout" section pointing at `make build-standalone-all`. Cloud Run guide now uses the `cp` idiom to copy the example template.
