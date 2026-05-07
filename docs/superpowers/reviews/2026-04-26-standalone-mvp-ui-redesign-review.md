# Standalone MVP + Editorial UI Redesign Review

Date: 2026-04-26

Branches reviewed:

- `feat/standalone-agent-mvp` on top of `main`
- `feat/ui-redesign-editorial` on top of `feat/standalone-agent-mvp`

Primary specs:

- `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md`
- `docs/superpowers/specs/2026-04-26-ui-redesign-editorial-shadcn-design.md`
- `docs/superpowers/plans/2026-04-26-ui-redesign-editorial-shadcn.md`

## Executive Summary

The product direction is strong. The standalone branch moves Idun toward the right open-source entry point: one agent can run as a self-contained service with chat, admin, traces, local persistence, reload, Docker, and Cloud Run deployment. The editorial UI branch makes that product feel more distinctive and easier to understand than the previous manager-first experience.

The branches should not merge or release as-is. The remaining issues are not mostly cosmetic. There are backend runtime correctness blockers, packaging blockers for the `pip install idun-agent-standalone` path, first-run chat behavior gaps, CI/E2E wiring issues, and repo hygiene problems. These directly affect the stated goal: a coherent OSS product that is easy to understand and test.

Recommended release order:

1. Fix backend runtime correctness and wheel install blockers.
2. Fix first-run chat rendering and assert it in E2E.
3. Fix static packaging, CI/E2E boot wiring, and repo hygiene.
4. Align docs terminology and public product narrative.
5. Polish UI responsiveness, accessibility, and theme behavior.

## Product Direction Assessment

The intended product split is correct:

- **Standalone**: single-agent open-source product, runnable locally and deployable to Cloud Run or similar environments.
- **Engine**: toolkit for productionizing LangGraph, Google ADK, and eventually broader LangChain-style agents.
- **Manager + Web**: enterprise governance hub for managing multiple Idun agents, policies, workspaces, users, and fleet-level resources.

This is a better open-source story than leading with a multi-agent manager. A developer can now start with one useful running agent, see the chat UI, inspect traces, edit config, and deploy it. The enterprise manager can then become the natural next layer instead of the only obvious product surface.

The main remaining product risk is naming and documentation ambiguity. Public docs still use "standalone" for both:

- engine-only `idun agent serve` with YAML and no bundled UI
- the new `idun-agent-standalone` product with DB-backed admin, bundled UI, and traces

That ambiguity will confuse users choosing a path.

## What Is Done

### Standalone Runtime

The standalone package implements the core MVP shape:

- `idun-agent-standalone` package and `idun-standalone` CLI
- `init`, `serve`, and `hash-password` flows
- FastAPI app composition over `idun_agent_engine`
- local SQLite default and Postgres via `DATABASE_URL`
- Alembic migrations
- YAML bootstrap into DB-backed admin state
- runtime config assembly
- admin REST endpoints for agent, guardrails, memory, MCP, observability, prompts, integrations, theme, settings, auth, traces, and config
- auth modes `none` and `password`
- session cookies with sliding renewal and password rotation invalidation
- hot reload orchestration for non-structural changes
- restart-required handling for structural changes
- trace capture via engine run-event observers
- batched trace writer and retention scheduler
- static UI mounting
- Docker image build
- Cloud Run and docker-compose documentation

### Engine Support

The engine branch adds important hooks required by the standalone:

- static UI mount support via `IDUN_UI_DIR`
- protected `/reload` through injected auth dependency
- run-event observers
- post-configure callbacks so trace observers can be reattached after reload
- MCP per-server failure isolation and status reporting

These changes move the engine toward being a reusable production wrapper, not just an internal manager runtime.

### Editorial UI Redesign

The UI redesign is a major improvement:

- Next.js 15 static export retained
- Tailwind v4 and shadcn/ui component model introduced
- semantic CSS variables and runtime theme config added
- editorial light/dark palette established
- custom font setup
- redesigned branded/minimal/inspector chat layouts
- history sidebar
- welcome hero
- markdown message rendering
- reasoning panel for plan/thoughts/tool calls
- tool call row display
- admin shell with sidebar, topbar, breadcrumbs, command palette, theme toggle, user menu
- reusable YAML editing sheet
- refreshed admin pages
- traces page and trace session sheet
- UI unit tests and Playwright smoke tests added

The redesign makes the standalone feel more like a polished self-hosted product and less like an internal control panel.

### Documentation

The docs now include a serious standalone slice:

- standalone overview
- quickstart
- CLI reference
- Cloud Run deployment
- docker-compose deployment
- UI customization
- root README updates
- framework docs
- examples docs

The Cloud Run page is especially useful because it calls out real operational constraints such as SQLite vs Cloud SQL, MCP limitations, and trace retention.

## Ship-Blocking Issues

### P0: Reload State Advances On Failed Or Restart-Required Reloads

`app.state.current_engine_config` is advanced even when reload returns `restart_required` or `init_failed`.

Impact:

- A structural edit can return `202 restart_required`, while the live agent is still the old one.
- App state now claims the new graph is current.
- A later non-structural edit can attempt to hot-load the restart-required graph.
- Recovery logic can use the wrong previous config.

Recommended fix:

- Treat `current_engine_config` as the live config.
- Only update it after a successful hot reload.
- Do not advance it on `restart_required`.
- On `init_failed`, keep or restore the last live config.
- Add regression tests for structural edit followed by non-structural edit.

### P0: Wheel-Installed Migrations Are Broken

The migration runner resolves `alembic.ini` using `Path(__file__).parents[3]`. That works in editable installs but not in a wheel install. Docker currently copies `alembic.ini` into the expected parent location as a workaround, but plain `pip install idun-agent-standalone` can fail before app boot.

Impact:

- Blocks the advertised OSS quickstart path.
- Docker smoke can pass while PyPI install fails.

Recommended fix:

- Resolve `alembic.ini` using package resources or a path relative to the installed package in a wheel-safe way.
- Add a wheel install smoke test outside Docker:
  - build wheel
  - create clean venv
  - install wheel
  - run `idun-standalone init`
  - run `idun-standalone serve`
  - hit `/admin/api/v1/health`

### P0: First-Run Chat Can Render Empty Assistant Response

Manual browser smoke found that the scaffolded echo agent stores `echo: hello from review` in traces, but the chat UI renders an empty assistant turn.

Likely cause:

- `useChat` handles `TEXT_MESSAGE_CONTENT` but ignores `STATE_SNAPSHOT` and `MESSAGES_SNAPSHOT`.
- The scaffolded/testing echo graph returns its assistant message via snapshots rather than streaming text deltas.
- The E2E chat test explicitly avoids asserting assistant response content.

Impact:

- The first OSS quickstart can look broken even though backend execution succeeds.
- Users may not trust the product after the first message.

Recommended fix:

- Hydrate assistant text from `MESSAGES_SNAPSHOT` or final state snapshots when text deltas are absent.
- Add E2E coverage that sends a message and asserts `echo: <message>` appears.
- Keep streaming delta behavior for real LLM agents.

### P0: E2E CI Boot Wiring Is Incomplete

`standalone-ci.yml` calls `pnpm test:e2e` directly, but `playwright.config.ts` has no `webServer`, and the boot script is not invoked by the test command.

Impact:

- CI may run Playwright without a live standalone server.
- Local successful E2E runs may not match CI.

Recommended fix:

- Add a Playwright `webServer` entry that invokes `e2e/boot-standalone.sh`, or wrap the CI step with explicit boot/wait/teardown.
- Ensure E2E runs against the built static UI and a real standalone backend.

### P0: E2E Boot Mutates Source Tree

`e2e/boot-standalone.sh` runs `make build-standalone-ui`, which copies static export assets into `libs/idun_agent_standalone/src/idun_agent_standalone/static`.

Impact:

- Running tests dirties the working tree with generated static assets.
- It makes review noise high and can accidentally commit built files.

Recommended fix:

- Build the UI into a temp directory and set `IDUN_UI_DIR` for the test server.
- Keep wheel packaging tests separate from E2E server boot.
- Add cleanup if any generated artifacts are unavoidable.

### P0: Repo Hygiene Artifacts Must Be Removed

The branch includes or generates local artifacts:

- `.cursor/hooks.json` with absolute local paths
- `.claude/settings.json`
- `.claude/worktrees/wonderful-spence` gitlink
- untracked `.claude/worktrees/*`
- `.claude/scheduled_tasks.lock`
- untracked static UI output after tests

Impact:

- Pollutes product branches with local agent/tooling state.
- Creates risk of broken paths on CI or other contributors' machines.

Recommended fix:

- Remove local tooling artifacts from the branch.
- Add ignore rules for `.claude/scheduled_tasks.lock` and local worktree output if needed.
- Ensure generated static assets are intentionally included only by release packaging, not normal E2E runs.

## Important Runtime Gaps

### Prompts Are Stored But Not Assembled Into Runtime Config

Prompt rows are seeded/exported, and the admin UI exposes prompt management, but `config_assembly.py` does not query `PromptRow` or set `data["prompts"]`.

Impact:

- Prompt admin changes do not affect runtime.
- Users may believe prompt edits are active when they are not.

Recommended fix:

- Wire prompt rows into `EngineConfig`.
- Add tests proving prompt admin changes alter assembled config and reload behavior.

### Integration Provider Casing Is Inconsistent

Admin/storage paths can store lower-case provider names such as `discord`, while schema validation expects upper-case provider values such as `DISCORD`.

Impact:

- Valid-looking integration config can fail schema validation.
- YAML bootstrap and admin-created integration behavior can diverge.

Recommended fix:

- Normalize provider names at boundaries.
- Add tests for lower-case YAML provider names and admin CRUD-created integrations.

### Password Changes Are Not Durable Across Restart

`/auth/change-password` updates the DB hash, but `_bootstrap_admin_user()` overwrites the DB hash from `IDUN_ADMIN_PASSWORD_HASH` on every boot.

Impact:

- In Cloud Run/container deployments, an admin-changed password silently reverts after restart unless env secrets are also rotated.

Recommended fix options:

- Env-only password model: remove or hide UI password change when env-managed.
- DB-managed password model: only seed from env if the admin row does not exist, or track explicit env rotation separately.
- Document whichever model is chosen.

### Session Secret Strength Is Not Enforced

The spec calls for a 32+ character `IDUN_SESSION_SECRET`, but runtime validation currently allows very short values.

Impact:

- Weak session signing secrets can be accepted in password mode.

Recommended fix:

- Enforce minimum length and fail fast in password mode.
- Add settings tests.

### Trace Event Ordering Can Interleave Multi-Run Sessions

Trace replay orders by `sequence` only, but sequence numbers are per `thread_id:run_id`.

Impact:

- Sessions with multiple runs can return all `sequence=0` events before all `sequence=1` events.

Recommended fix:

- Order by `created_at`, `run_id`, and `sequence`, or persist a session-global sequence.

### Runtime Theme Merge Is Shallow

`runtime_config.py` shallow-merges DB theme config over defaults. A partial persisted `colors` object can replace the whole color tree.

Impact:

- Partial theme edits can remove required light/dark semantic tokens.

Recommended fix:

- Deep merge theme config.
- Validate theme config before persistence and before runtime serialization.

## UI/UX Gaps

### Runtime Theme Defaults Are Not Fully Honored

`ThemeLoader` applies runtime variables in `useEffect`, which can flash after hydration. `theme.defaultColorScheme` is saved but `ThemeProvider` is hard-coded to `defaultTheme="system"`.

Impact:

- Theme settings may not affect first paint or default mode correctly.

Recommended fix:

- Pass runtime `defaultColorScheme` into `ThemeProvider`.
- Consider server/inlined pre-hydration theme CSS for static export.

### Login Uses Removed Legacy Tokens

The login page still references old tokens such as `--color-bg` and `--color-fg`.

Impact:

- The first auth screen may render with invalid or inconsistent colors.

Recommended fix:

- Move login styles to semantic variables: `--background`, `--foreground`, `--card`, `--muted`, etc.

### Chat History Does Not Hydrate Or Reset On Session Switch

Session selection changes `?session=...`, but `useChat` owns local state and does not reset or hydrate messages when `threadId` changes.

Impact:

- Clicking history rows likely does not show that conversation.

Recommended fix:

- Reset local chat state when `threadId` changes.
- Hydrate selected session from trace messages or a dedicated conversation endpoint.
- Add E2E for selecting a prior conversation.

### Responsive Chat Layouts Are Partial

The admin shell has mobile sidebar behavior, but branded chat always keeps a history sidebar, and inspector layout uses fixed grid columns.

Impact:

- Small-screen chat may be cramped or unusable.

Recommended fix:

- Collapse history into a drawer/sheet on small screens.
- Hide or sheet the inspector panel on small screens.
- Add responsive Playwright snapshots or smoke checks.

### Custom Disclosure Accessibility Needs Work

`ReasoningPanel` and `ToolCallRow` custom collapsibles should expose state.

Recommended fix:

- Add `aria-expanded`.
- Add `aria-controls`.
- Ensure keyboard behavior is correct.

### shadcn Composition Drift

The branch mostly follows shadcn guidance, but there are some drifts:

- raw status colors in `ToolCallRow`
- ad hoc shimmer divs in `HistorySidebar`
- some direct spacing/padding patterns rather than composed primitives
- icon sizing classes in some component contexts

Impact:

- Not a blocker, but weakens the design-system consistency goal.

Recommended fix:

- Convert custom status visuals to `Badge` variants or semantic token classes.
- Prefer `Skeleton`, `Badge`, `Alert`, `Separator`, and shadcn primitives where they fit.

## API And Product Consistency Gaps

### Trace Session Search Is Wired In UI But Ignored By Backend

The UI calls `api.listSessions({ search })`, and `/traces/` exposes "Search session ID or title...", but the backend `list_sessions` route only accepts `limit` and `offset`.

Impact:

- The UI implies session search works, but backend ignores it.

Recommended fix:

- Add backend `search` support for session ID/title/message metadata, or remove UI search until supported.

### `patchSession` Exists Without Backend Endpoint

`api.patchSession` exists in the frontend client, but the backend does not expose `PATCH /admin/api/v1/traces/sessions/{sid}`.

Impact:

- Misleading API client surface.

Recommended fix:

- Implement title patching if session titles are part of MVP.
- Otherwise remove the unused client method.

### Scaffold `.env` Instructions Are Misleading

`idun-standalone init` tells users to run `cp .env.example .env`, but `StandaloneSettings` sets `env_file=None`, and `serve` does not load dotenv.

Impact:

- Users may edit `.env` and expect settings to apply, but they will not.

Recommended fix options:

- Load `.env` intentionally from the working directory.
- Or change scaffolded README/CLI output to use `export` examples and say `.env.example` is only a reference.

## Documentation Findings

### Strong Areas

- Standalone docs are practical and operationally honest.
- Cloud Run docs address real constraints.
- CLI reference is concrete.
- Root README now exposes the standalone path.
- Internal design specs are clear enough for reviewers.

### Gaps

- FAQ says no DB is required for "standalone", which describes engine-only mode, not the new standalone product.
- Main quickstart CLI tab can be read as the pip standalone product but points at engine-only CLI.
- Root README comparison table may overclaim "low maintenance", "no lock-in", and broad SSO/RBAC depending on deployment mode.
- LangChain appears in positioning, but first-class production agent support is still mostly LangGraph and ADK.
- Design spec is still marked draft, which can undercut confidence if linked externally.
- `CONTRIBUTING.md` does not cover standalone UI/wheel build/test workflow.

### Recommended Docs Fixes

- Add a glossary: Engine, Standalone, Manager, Web UI.
- Clarify two paths:
  - engine-only: `idun agent serve`
  - standalone product: `idun-standalone serve`
- Update FAQ storage/auth answers.
- Add a top-level "run and test standalone from clone" contributor section.
- Add a release smoke checklist:
  - health
  - login
  - one chat
  - one trace
  - admin edit + reload
  - Docker health
  - wheel install smoke
- Add public roadmap language for:
  - today: LangGraph + ADK
  - next: OIDC, metrics/logs, hub import, stronger LangChain story

## Verification Summary

Commands and checks run during the review:

- `uv run pytest libs/idun_agent_standalone/tests -q`
  - passed in subagent review: `80 passed`
- engine standalone-related slices
  - passed in subagent review
- `uv run ruff check libs/idun_agent_standalone --no-cache`
  - passed
- `uv run pytest -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q`
  - passed with expected skips
- `pnpm typecheck`
  - passed
- `pnpm test`
  - passed: 7 files, 28 tests
- Playwright E2E
  - passed during live review when manually booted against standalone
- Manual browser pass
  - found empty assistant response despite successful backend run and trace capture
- Context7/shadcn review
  - confirmed semantic CSS variable approach is aligned with current shadcn guidance

Verification caveats:

- Docker smoke was not fully re-run in this consolidated pass.
- Wheel install smoke outside Docker remains required.
- E2E CI wiring still needs to be fixed or proven.
- Local Node version differed from CI in one subagent pass; final UI checks should run under Node 20.

## Minimum Merge Gate

Before merging `feat/ui-redesign-editorial` into the standalone branch:

- Fix empty assistant response rendering.
- Add E2E assertion for echo response body.
- Fix login semantic tokens.
- Fix chat history session switch behavior or hide history switching until supported.
- Fix trace session search mismatch.
- Remove `patchSession` or implement backend support.
- Remove local `.claude` and `.cursor` artifacts.
- Stop E2E boot from dirtying static assets.
- Run:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - live `pnpm test:e2e`

Before merging `feat/standalone-agent-mvp` toward `main`:

- Fix reload state advancement.
- Fix wheel migration path.
- Wire prompts into `EngineConfig` or remove prompt runtime claims.
- Normalize integration provider casing.
- Decide password rotation model.
- Enforce session secret length.
- Add wheel install smoke.
- Add Docker smoke.
- Run:
  - `uv run pytest libs/idun_agent_standalone/tests -q`
  - engine standalone-related test slices
  - `uv run ruff check libs/idun_agent_standalone --no-cache`
  - full repo test subset excluding external services

## Recommended Iteration Plan

### Phase 1: Runtime Correctness

1. Fix `current_engine_config` live-state semantics.
2. Add regression tests for structural reload followed by non-structural reload.
3. Fix wheel-safe migration file resolution.
4. Add clean wheel install smoke.
5. Enforce password/session secret invariants.

### Phase 2: Runtime Config Completeness

1. Wire prompts into assembled engine config.
2. Normalize integration providers.
3. Deep merge runtime theme config.
4. Add tests for YAML bootstrap, admin mutation, export, and assembled config.

### Phase 3: First-Run UX

1. Fix assistant response rendering from snapshots.
2. Strengthen chat E2E to assert response text.
3. Fix chat history switching.
4. Fix login semantic tokens.
5. Add password-auth E2E smoke.

### Phase 4: CI And Packaging

1. Fix Playwright server boot in CI.
2. Avoid test-generated static assets in source tree.
3. Add UI unit tests to standalone CI.
4. Add wheel content inspection.
5. Add Docker smoke.
6. Align local and CI Node versions.

### Phase 5: Docs And Positioning

1. Update FAQ and quickstart terminology.
2. Add glossary and deployment-path decision guide.
3. Update CONTRIBUTING for standalone workflows.
4. Add standalone release smoke checklist.
5. Soften or footnote README comparison claims.
6. Clarify LangGraph/ADK today and LangChain intent.

### Phase 6: UI Polish

1. Improve responsive chat layouts.
2. Add disclosure accessibility attributes.
3. Replace shadcn composition drifts where practical.
4. Add screenshot pass for standalone docs after redesign lands.

## Final Recommendation

Continue with the standalone MVP and editorial redesign. The architecture and product direction are right, and the work already covers a large portion of the intended MVP.

Do not ship until the backend runtime blockers and first-run chat issue are fixed. The open-source promise depends on a clean path from install to first successful chat to trace inspection. Once that path is reliable, the remaining issues become normal MVP hardening rather than existential product risks.
