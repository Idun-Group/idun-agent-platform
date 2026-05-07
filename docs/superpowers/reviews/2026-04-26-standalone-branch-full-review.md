# Standalone Branch Full Review

Date: 2026-04-26

Branch reviewed: `feat/standalone-agent-mvp`

Scope:

- Current branch work, including Phase 1 and Phase 2 commits on top of `origin/feat/standalone-agent-mvp`.
- `libs/idun_agent_standalone`, `services/idun_agent_standalone_ui`, relevant `idun_agent_engine` integration points.
- Comparison context from `services/idun_agent_manager` and `services/idun_agent_web`.
- No source code changes were made as part of this review.

## Executive summary

The branch has moved from "promising but not shippable" to "close to an MVP-quality open-source entry point." The most important prior blockers are now fixed: wheel-safe migrations, reload state correctness, snapshot-based assistant hydration, E2E boot isolation, prompt wiring, integration provider normalization, password durability, session secret enforcement, and runtime theme deep-merge.

The strongest product achievement is the new standalone shape: one agent can run as a deployable FastAPI service with chat, admin, traces, SQLite/Postgres persistence, reload, Docker/Cloud Run support, and a bundled static UI. This is much easier for the open-source community to understand and try than the earlier manager-first story.

The remaining blockers are narrower but still important:

- Trace event replay still orders by `sequence` only, even though `sequence` is per run. Multi-run sessions can interleave.
- Standalone UI still has product gaps around mock logs, partial auth coverage, limited responsive coverage, and design-token drift.
- Public docs and README still mix the old manager-first story, engine-only standalone mode, and the new `idun-agent-standalone` product.
- Enterprise `idun_agent_web` currently fails production build type checking, which weakens the "coherent product family" story even if it is not a blocker for standalone.

Recommendation: continue toward shipping the standalone MVP, but make trace ordering, docs/product language, and the first-run contributor story the next release gate.

## What is done

### Standalone backend/runtime

The standalone runtime now implements the intended single-agent appliance architecture.

Key capabilities:

- `idun-agent-standalone` package with `idun-standalone` CLI.
- `init`, `serve`, `hash-password`, and export flows.
- FastAPI app wrapping `idun_agent_engine`.
- SQLite default, Postgres option through `DATABASE_URL`.
- Alembic migrations packaged in the wheel through `importlib.resources`.
- YAML first-boot seed into DB-backed admin state.
- DB as source of truth after bootstrap.
- Admin REST endpoints for agent, guardrails, memory, MCP, observability, prompts, integrations, theme, auth, config, and traces.
- Password and `none` auth modes, with OIDC explicitly rejected for now.
- Password hash durability after first boot, with explicit `IDUN_FORCE_ADMIN_PASSWORD_RESET=1`.
- Session secret minimum length enforcement in password mode.
- Hot reload for non-structural edits and 202 `restart_required` for structural changes.
- Trace capture through engine run observers.
- Batched trace writer and retention.
- Runtime config script for theme/auth/layout.

Core files:

- `libs/idun_agent_standalone/src/idun_agent_standalone/app.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/config_assembly.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/config_io.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/reload.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/runtime.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/settings.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/db/migrate.py`
- `libs/idun_agent_standalone/src/idun_agent_standalone/theme/runtime_config.py`

### Standalone UI

The standalone UI is now a real product surface rather than a thin demo.

Implemented:

- Next.js 15 static export bundled into the Python wheel.
- Tailwind v4 and shadcn-style component system.
- Runtime theme injection via `/runtime-config.js`.
- Chat route at `/` with branded, minimal, and inspector layouts.
- Snapshot hydration for agents that return final assistant messages without token deltas.
- Admin shell under `/admin/*` with sidebar, topbar, breadcrumbs, theme toggle, user menu, and command palette.
- Admin pages for agent, guardrails, memory, MCP, observability, prompts, integrations, settings, and dashboard.
- Traces pages under `/traces/*`.
- Logs page shell, currently mock-backed.
- Vitest component and hook tests.
- Playwright E2E with webServer boot.

Core files:

- `services/idun_agent_standalone_ui/app/page.tsx`
- `services/idun_agent_standalone_ui/app/admin/layout.tsx`
- `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`
- `services/idun_agent_standalone_ui/app/traces/page.tsx`
- `services/idun_agent_standalone_ui/lib/use-chat.ts`
- `services/idun_agent_standalone_ui/lib/agui.ts`
- `services/idun_agent_standalone_ui/lib/runtime-config.ts`
- `services/idun_agent_standalone_ui/lib/theme-loader.tsx`
- `services/idun_agent_standalone_ui/playwright.config.ts`
- `services/idun_agent_standalone_ui/e2e/boot-standalone.sh`

### Engine support

The engine now has the embedder hooks the standalone needs.

Implemented:

- `reload_auth` injection for protected reload in embedded deployments.
- Post-configure callback support so trace observers can reattach after reload.
- Static UI mount behavior.
- Run-event observer support.
- Per-MCP-server failure isolation and status surfacing.

Core files:

- `libs/idun_agent_engine/src/idun_agent_engine/core/app_factory.py`
- `libs/idun_agent_engine/src/idun_agent_engine/server/lifespan.py`
- `libs/idun_agent_engine/src/idun_agent_engine/agent/observers.py`
- `libs/idun_agent_engine/src/idun_agent_engine/mcp/registry.py`

## What improved since the previous review

The earlier review identified six ship blockers and six runtime gaps. Most are now resolved.

Resolved:

- Reload state no longer advances `current_engine_config` on restart-required or failed reloads.
- Alembic migration lookup is wheel-safe.
- Chat assistant text hydrates from `MESSAGES_SNAPSHOT`.
- Playwright E2E boots its own backend through `webServer`.
- E2E boot builds static UI into a temp directory rather than mutating source.
- Local `.claude` and `.cursor` artifacts are removed from the branch.
- Prompt rows now reach `EngineConfig.prompts`.
- Integration provider casing is normalized at assembly and admin boundaries.
- Password changes are durable across restart unless an explicit force-reset env var is set.
- `IDUN_SESSION_SECRET` minimum length is enforced in password mode.
- Runtime theme config deep-merges persisted partial themes over defaults.
- Wheel install smoke exists and passed locally.

Still unresolved or only partially resolved:

- Trace event ordering across multi-run sessions.
- Real logs endpoint and UI.
- Password-auth and OIDC E2E coverage.
- Responsive coverage for minimal/inspector chat layouts.
- Theme default color scheme and first-paint behavior.
- Product terminology across README/docs.
- Enterprise web build health.

## Findings

### Important: trace event ordering can still interleave runs

`get_session_events()` still orders events by `TraceEventRow.sequence.asc()` only.

Why this matters:

- `sequence` is per `(thread_id, run_id)`, not session-global.
- A session with two runs can return `run1.sequence=0`, `run2.sequence=0`, `run1.sequence=1`, `run2.sequence=1`.
- The traces viewer can present an incorrect event narrative for multi-run sessions.

Evidence:

- `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py`
- The query uses `stmt.order_by(TraceEventRow.sequence.asc()).limit(1000)`.
- The Phase 2 design spec explicitly called for `(created_at, run_id, sequence, id)` ordering.

Recommendation:

- Change ordering to `created_at ASC, run_id ASC, sequence ASC, id ASC`.
- Add an integration test with two runs in one session.
- Treat this as the next backend correctness fix.

### Important: standalone logs page is still a placeholder

The UI exposes `/logs`, but it renders mock `FAKE_LOGS`.

Why this matters:

- The product promises "chat, admin, traces, logs" as a complete local operator surface.
- A mock log page can mislead users testing the standalone package.

Recommendation:

- Either implement a real `/admin/api/v1/logs` endpoint backed by recent trace/runtime events, or rename/hide the page until logs are real.
- If logs are not in MVP, call this out in docs as deferred.

### Important: docs and README overstate or blur product boundaries

The repo now has three separate product experiences:

- Engine file mode: `idun agent serve --source file`.
- Standalone Agent: `idun-standalone serve`.
- Manager mode: engines fetch config from `idun_agent_manager`.

Current docs still blur these paths.

Evidence:

- `README.md` correctly adds a standalone section, but the top positioning still frames Idun primarily as a control plane.
- `docs/quickstart.mdx` still labels the engine CLI path as "standalone agent without the Manager," which is now ambiguous.
- `docs/manager/overview.mdx` references prompts in materialized config, while the manager assembly code currently does not visibly add prompts in `services/idun_agent_manager/src/app/services/engine_config.py`.
- README comparison claims around LangGraph Cloud/LangSmith self-hosting are now stale against current LangSmith Deployment positioning.

Recommendation:

- Add a public glossary: Engine SDK, Standalone Agent, Manager, Web UI, Managed mode.
- Make `idun-agent-standalone` the default OSS quickstart.
- Move the manager path to "Teams and enterprise governance."
- Soften comparison-table claims and re-check every claim against current implementation.

### Important: enterprise web build is currently unhealthy

The manager/web stack is part of the coherent product story, but `services/idun_agent_web` currently fails `npm run build`.

Observed TypeScript failure categories:

- Type-only import issue in `src/App.tsx`.
- Generated schema drift around `engine_config.sso`, `mcpServers` vs `mcp_servers`, and integration config unions.
- Stale component state names in `agent-form-modal`.
- Storybook/example data drift for agent/user component props.
- Missing `use-settings-page` import target.

This is not a standalone release blocker, but it is a product coherence blocker if the public story is "one platform, two deployment profiles."

Recommendation:

- Run a dedicated enterprise web type-hardening pass.
- Decide whether manager/web is active product code or temporarily enterprise-preview.
- If enterprise web remains in the public README, it should build.

### Medium: standalone UI command palette is uneven across shells

The admin layout wires `GlobalCommand`, but traces/logs layouts use the shared topbar without the same opener behavior.

Recommendation:

- Either make the command palette global across `/admin`, `/traces`, and `/logs`, or remove command affordances from traces/logs shells.

### Medium: theme and design tokens still have drift risks

The backend now deep-merges theme config, but the UI still has several sources of theme truth:

- `services/idun_agent_standalone_ui/lib/runtime-config.ts`
- `services/idun_agent_standalone_ui/app/admin/settings/page.tsx`
- `services/idun_agent_standalone_ui/app/globals.css`
- Backend `DEFAULT_THEME` in `runtime_config.py`

Recommendation:

- Keep one canonical token contract.
- Add tests for default theme shape parity across backend runtime config and frontend type expectations.
- Audit legacy `--color-bg` / `--color-fg` usages and convert to semantic shadcn tokens.

### Medium: auth coverage is incomplete

The standalone backend supports `none` and `password`; OIDC is explicitly deferred. Current E2E runs in `none` mode.

Recommendation:

- Add password-mode E2E for login, logout, admin redirect, and failed password.
- Keep OIDC visibly marked as MVP-2 in UI and docs until real.

### Medium: open-source onboarding still needs a stronger proof path

The wheel smoke now passes, but the best OSS path should be obvious:

1. `pip install idun-agent-standalone`
2. `idun-standalone init my-agent`
3. `idun-standalone serve`
4. Send a chat message.
5. Open a trace.
6. Edit config and reload.
7. Deploy to Cloud Run.

Recommendation:

- Make this the top quickstart.
- Add a "release smoke checklist" to docs and contributing.
- Provide a no-LLM echo demo and a real LangGraph LLM demo.

## Verification

All commands were run locally on 2026-04-26.

### Passed

- `uv run pytest libs/idun_agent_standalone/tests -q`
  - Passed: 106 tests.
  - Warnings: LangGraph/ag-ui/Pydantic deprecations.
- `uv run pytest libs/idun_agent_engine/tests/integration/server libs/idun_agent_engine/tests/unit/agent/test_observers.py -q`
  - Passed: 9 tests.
  - Warnings: Guardrails Hub post-install failures logged during test setup, plus Pydantic/ag-ui deprecations. Exit code was still 0.
- `uv run ruff check libs/idun_agent_standalone --no-cache`
  - Passed.
- `cd services/idun_agent_standalone_ui && pnpm typecheck`
  - Passed.
- `cd services/idun_agent_standalone_ui && pnpm test`
  - Passed: 7 files, 31 tests.
- `cd services/idun_agent_standalone_ui && pnpm build`
  - Passed: Next.js 15.5.15 static export, 17 static pages.
- `cd services/idun_agent_standalone_ui && pnpm test:e2e`
  - First attempt failed because it ran concurrently with `pnpm build`; rerun alone passed.
  - Passed: 11 Playwright tests.
- `scripts/wheel-install-smoke.sh`
  - Passed: built schema, engine, and standalone wheels, installed in clean venv, verified packaged `alembic.ini`, scaffolded, served, and hit `/admin/api/v1/health`.
- `uv run pytest services/idun_agent_manager/tests/unit -q`
  - Passed with one expected SQLite skip.
- `cd services/idun_agent_web && npm exec vitest run src/utils/deployment.test.ts src/services/agents.test.ts src/utils/agent-fetch.test.ts`
  - Passed: 3 files, 12 tests.
- `git status --short`
  - Clean after verification before writing report files.

### Failed or caveated

- `cd services/idun_agent_web && npm run build`
  - Failed with TypeScript errors in the existing enterprise web app.
- Manual browser smoke through the Cursor browser MCP was attempted after starting the E2E boot script manually, but the temporary server lifecycle did not remain stable outside Playwright. This review relies on the passing Playwright browser E2E suite for browser-level standalone verification.

## Recommended next work

### Next release gate

1. Fix trace event ordering and add regression test.
2. Update quickstart and README terminology around Engine SDK, Standalone Agent, and Manager.
3. Make the no-LLM standalone quickstart the first public proof path.
4. Add password-mode E2E.
5. Hide or implement real logs.

### Next hardening wave

1. Enterprise web build/type cleanup.
2. Theme token parity and first-paint audit.
3. Trace detail E2E beyond list/open smoke.
4. Responsive chat coverage for minimal and inspector layouts.
5. Accessibility audit for custom disclosure components.

### Product coherence wave

1. Rename public concepts:
   - Engine SDK
   - Standalone Agent
   - Manager
   - Web UI
   - Managed mode
2. Add a deployment decision guide.
3. Add a migration path: standalone DB/YAML to manager-managed agent.
4. Add honest comparison pages against LangSmith Deployment, Dify, Google Agent Engine, and DIY FastAPI.

## Final assessment

The standalone branch is directionally right and technically much stronger than the earlier review state. The project now has a credible OSS wedge: "bring one LangGraph or ADK agent, get a production-shaped local app with chat, admin, traces, and deployment."

Do not let the manager/web story dilute that wedge. Standalone should be the default way to try Idun. The manager/web stack should be positioned as the enterprise governance layer for many agents, not as the required starting point.
