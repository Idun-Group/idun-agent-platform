# Changelog — idun-agent-standalone

All notable changes to `idun-agent-standalone` are documented here. This package is co-bundled inside the `idun-agent-engine` wheel; its version tracks the engine version.

## [Unreleased]

_No unreleased changes yet._

## 0.6.1 — 2026-05-20

Patch release. Fixes the password-mode chat surface that the v0.6.0 hardening accidentally locked behind `/login`, and propagates a stable per-session `user_id` end-to-end so chat history and traces can be scoped per user when the standalone UI runs under password auth without a full OIDC ladder.

### Added

- `/runtime-config.js` now carries `agentReady` (bool) and `bootFailed` (bool) so the SPA can decide between rendering chat and redirecting to `/onboarding` synchronously at hydration, with no extra HTTP roundtrip. `bootFailed` is boolean by design — the raw boot-error string was previously echoed back to anonymous browsers and could leak DB connection URIs, file paths, and parse traces (#671).
- Chat SPA mints a stable per-session `user_id` (SSO email when present, else fresh UUID, cached in module state) and attaches `X-Idun-User-Id` on every `/agent/*` call. The active id renders in the History sidebar so visitors can confirm which identity is being sent to the engine (#671).

### Changed

- `_is_public_runtime_path` lets `/agent/sessions` and `/agent/sessions/{id}` through the password gate. `useChat` hits these on every chat page load; without this they 401 and the SPA's global handler hard-navigates to `/login` even though chat itself is open under `auth_mode: password`. Per-user scoping of these endpoints is the engine adapter's job (#671).
- `BrandedLayout` and `InspectorLayout` drop the duplicated brand from their own chat-area headers; brand (logo + app name) and the active `user_id` move into the sidebar top, above History/New (#671).

### Fixed

- Password mode no longer hard-redirects to `/login` on the chat surface. The chat root no longer calls `api.getAgent()` (admin-gated under password mode, the source of the 401-redirect-to-`/login` bug); onboarding routing now reads `agentReady` / `bootFailed` from `/runtime-config.js` synchronously (#671).

## 0.6.0 — 2026-05-17

First wide release of the standalone admin/chat/traces app, the bundled UI behind the **Idun Engine v0.6.0** launch. Previously circulated as a `0.1.0` dev snapshot; this release is the version published as part of `idun-agent-engine 0.6.0` and is the first one adopters will install via `pip install idun-agent-engine && idun setup && idun serve`. Full launch context: [The third path](https://idun-group.com/blog/2026-05-17-third-path-engine-v0.6).

### Added

**Core product surface**

- Single-process FastAPI app: `idun serve` (canonical entry point of the bundled `idun` console script).
- Chat UI at `/` — Next.js 15, three layout variants (Branded, Minimal, Bare).
- Admin panel at `/admin/` — agent config, guardrails, memory, observability, MCP, prompts, integrations, theme, settings.
- Auth ladder: `none` for laptop dev, `password` for containerized deploys. OIDC is deferred to a future release.
- `idun init` scaffolds a working LangGraph agent project.
- SQLite by default; Postgres via `DATABASE_URL` (Cloud SQL unix-socket DSNs supported via the documented `cloudsql-instances` annotation).
- Hot-reload of the live agent via the admin UI; framework / graph-path changes still require a restart.
- APScheduler-based hourly retention purge of trace events.
- `idun hash-password` CLI utility for provisioning password-auth admin users.

**Traces feature (T1–T8)**

- New `/traces/` viewer in the admin panel: list + detail with Tree and Waterfall views (#606, #607, #608).
- `standalone_trace` + `standalone_span` Postgres tables. The trace table holds the full 16-byte W3C `otel_trace_id`; the span table holds the trailing 8 bytes for efficient joining. The API translates between the two transparently (resolves L11-30).
- Span-kind extraction for OpenInference `LLM` spans: model, provider, prompt / completion / cache tokens, plus per-call cost via the bundled `litellm_prices.json`.
- Asyncpg COPY-based writer with CI Postgres service and alembic logger fix (#607).
- LangChain instrumentor self-installed with isolated runtime-context handling so traces do not bleed across requests; explicit guards against OTel SDK drift.
- Backend correctness + UX polish on the trace list and detail pages (#608).
- TraceWriter user.id and lifecycle helper carried in from the engine prep PR (#601).

**Admin dashboard**

- `/admin` landing page now shows real activity sourced from the trace store: session count, run count, recent activity timeline (#628). Replaces the placeholder counters that previously said "0 sessions / 0 runs" while traces existed in the same tab.

**Standalone seeder**

- Persists all top-level YAML config blocks (agent, guardrails, mcp, prompts, integrations, observability) when `idun setup` is invoked. Closes the seeder gap where some blocks were silently dropped on first boot (#589).

**OpenAPI surface**

- Routers re-tagged into five coherent OpenAPI bundles for `/docs` grouping (#606, #PR tagging series).

**Discoverability and UX**

- Admin link surfaced on the welcome state of BrandedLayout and in the MinimalLayout header (#612 / admin-discoverability).
- Developer sidebar group with links to `/docs` and `/redoc`.
- Guard, transport, and provider catalogs promoted into the guardrails, MCP, and integrations admin pages (#PR catalog series).
- Wizard helper, secret masking, auth-mode signals, and a fix for the login dead-end (UI-014, UI-016, UI-011, UI-015) (#615).
- Sidebar history sidebar auto-refreshes after a run and sorts newest first (#621).

**PostHog**

- Product analytics + masked session replay wired into the chat UI. Replay is opt-in via the standalone settings, with masking on by default (#635).

### Changed

- **Bundled into the engine wheel.** The standalone is no longer published as a separate distribution. Its source ships inside `idun-agent-engine` and the `idun` console script is the canonical entry point. The repo's prior multi-wheel publish path (Dockerfile.base etc.) remains internal-only for local development (#570).
- **Standalone admin DB rework.** Schema and migrations rebuilt for the production admin path. After upgrade, `idun setup` must run to apply migrations (#566).
- **Secure-by-default host binding.** `idun serve` no longer binds `0.0.0.0` by default; a deliberate opt-in is required for bind-all. Documented in the CLI reference (#614).
- **Standalone "admin-only mode" fails loud.** When a configured `config.yaml` plus `idun setup` plus an agent row in the DB would normally produce an agent, but `assemble_engine_config` raised, the boot now emits a banner and reflects in `/health` instead of logging a single WARNING and serving 503s silently (#644). Resolves L10-2.
- **Catch-all 404 for `/admin/api/v1/<unmapped>`.** Unknown admin API paths now return JSON 404 instead of falling through to the chat UI HTML (#647). Resolves L11-33.
- Engine MCP registry mirrored for prompts: prompts resolve from the `EngineConfig` snapshot, matching MCP resolution and removing per-request re-reads (#625).
- CLI consolidated under a single `idun` entry: `track_command` telemetry ported to the new shape (#573).

### Deprecated

- The previous `idun-standalone` console script alias is gone; use `idun`. Older docs and Dockerfiles that invoke `idun-standalone serve` should switch to `idun serve`.

### Removed

- Haystack framework support across the standalone (#570, #576). UI framework picker, framework-type enum, and the unsupported-framework tests have been rewired off the Haystack path.

### Fixed

- Trace pipeline no longer drops trace rows when the runtime OTel context leaks a parent (#620).
- RSC shell routes and admin link prefixes fixed; eliminates the trace 404 noise observed during L11 walkthrough (#619).
- Tool calls in the chat UI render their args and result instead of the literal string `"null"` (#630).
- Guardrails AI help text now links to the Guardrails Hub keys page (#618).
- Sidebar history auto-refreshes after a run and sorts newest first (#621).
- MCP Sheet title uses the human-readable transport label (#PR transport label).
- Label catalog pickers; symmetric MCP edit-title (#PR catalog-pickers).
- New-tab behavior announced on Developer sidebar links (a11y).

### Security

- The default install footprint shrinks: `guardrails-ai` is now an optional extra of the engine (`idun-agent-engine[guardrails]`). Standalone deployments that do not opt in lose the Guardrails-AI integration but cut a significant transitive dependency surface (#642).
- Bind host defaults to loopback; bind-all requires an explicit opt-in (#614).
- Repo-wide security hardening: SHA-pinned actions, dep-audit job, `SECURITY.md`, Socket security gates on PRs and publish (#638, #634, #641).

### Build, CI, and release tooling

- `Dockerfile.base` builds wheels for `idun-agent-schema`, `idun-agent-engine`, and `idun-agent-standalone` from local sources and installs all three into the runtime stage. The image no longer depends on the standalone wheel being on PyPI before the first release.
- `standalone-ci.yml`: `docker-smoke` builds the runtime image and asserts `/admin/api/v1/health` returns 200; `e2e` runs the Playwright suite against a booted standalone.
- Make targets: `make test-standalone`, `make e2e-standalone`, `make ci-standalone`, `make build-standalone-ui`, `make build-standalone-all`.
- `docker-compose.example.yml` drops the obsolete `version: "3.9"` key (Compose v2 ignores it).
- `cloud-run.example.yaml` documents the required `run.googleapis.com/cloudsql-instances` annotation at both the service and the revision level so Cloud SQL unix-socket DSNs work out of the box.
- Repo root `pyproject.toml` declares the four packages as a uv workspace; `uv build --package idun-agent-standalone` works from the repo root.
- New docs page `/standalone/cli`: single reference for the six CLI commands and every env var. Quickstart gained a "Local development from a checkout" section pointing at `make build-standalone-all`. Cloud Run guide uses the `cp` idiom to copy the example template.
- E2E Playwright real-LLM specs for chat and admin reload (#580); ADK adapter coverage across chat / streaming / multi-turn / tool-call (#579); CONTRIBUTING rule + tests/e2e run-book (#588).

### Upgrading from a `0.1.0` snapshot

If you ran any pre-release `0.1.0` snapshot of `idun-agent-standalone` from a private wheel or local checkout:

1. Uninstall the standalone wheel: `pip uninstall idun-agent-standalone`. The 0.6.0 release ships it bundled inside the engine wheel.
2. Reinstall: `pip install idun-agent-engine==0.6.0`. Verify the bundle landed correctly: `python -c "import idun_agent_engine, idun_agent_standalone, idun_agent_schema"` and `idun --help`.
3. Run `idun setup` to apply the admin DB migrations from the rework (#566).
4. Replace any `idun-standalone serve` invocations in your Dockerfiles, docker-compose files, or systemd units with `idun serve`.
5. If your config used `framework: haystack`, migrate to LangGraph or ADK. Haystack is no longer supported.
6. If your deployment relied on the implicit `0.0.0.0` bind, set the host explicitly per the CLI reference at `docs/standalone/cli.mdx`.
