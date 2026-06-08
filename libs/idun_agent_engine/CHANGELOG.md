# Changelog

All notable changes to `idun-agent-engine` are documented here. This project follows [Semantic Versioning](https://semver.org/) and broadly tracks the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) layout.

## [Unreleased]

_No unreleased changes yet._

## 0.6.3 — 2026-06-08

Patch release. Hardens the `/reload` pipeline under concurrency and makes config-from-API async (#698).

### Fixed

- **Reload concurrency.** Reloads now serialize on a per-app `asyncio.Lock`, build the new agent before tearing down the old one, and swap `app.state.agent` atomically — fixing a deadlock when reloads overlapped and a mid-run `'NoneType' object is not a mapping` crash when a run was in flight during a swap. In-flight streaming runs are drained before the old agent is closed, and the in-flight count is now taken at stream construction rather than the body generator's first iteration, so a concurrent reload can no longer close an agent out from under a run whose stream has not started yet (#698).

### Changed

- **`with_config_from_api` is now async** and built on `httpx`, with trailing-slash normalisation and consistent `ValueError` wrapping, to support the enrolled-mode boot flow (#698).

## 0.6.2 — 2026-05-21

Patch release. No engine code changes. Ships the bundled `idun-agent-standalone` UI at 0.6.2, which fixes a cluster of SPA-navigation bugs in the admin surface under Next.js 15 `output: "export"` (AuthGuard `?next=` preservation, post-login hard-nav, trace detail soft-nav resolution, sidebar Traces + post-delete hard-nav). See `libs/idun_agent_standalone/CHANGELOG.md` for the full list (#682).

## 0.6.1 — 2026-05-20

Patch release. The engine now accepts a per-request `X-Idun-User-Id` header and binds it to a `current_user_id` ContextVar that adapter code (and the standalone trace writer) read at the start of every `/agent/*` invocation, so chat history and traces can be scoped per user when the standalone UI runs under password auth without a full OIDC ladder. Pairs with the standalone changes in `0.6.1` that open the chat shell under password mode.

### Added

- `_resolve_user_id` resolution order on `/agent/*`: SSO claim (`email` > `sub`) > `X-Idun-User-Id` header > fresh `uuid4().hex`. Always returns a non-empty string. The header is trusted only when SSO claims are absent (#671).
- `_bind_user_id` context manager wraps adapter calls in `list_sessions` and `get_session` so the LangGraph adapter can read `current_user_id` to scope checkpoint metadata (#671).

### Changed

- `X-Idun-User-Id` is validated: capped at 256 chars; control bytes `0x00–0x1F` and `0x7F` are rejected; on rejection the resolver falls through to the `uuid4` fallback so the caller still gets a usable id (#671).

## 0.6.0 — 2026-05-17

The release where Idun Engine becomes **the third path between LangGraph Cloud and DIY**. The engine wheel now bundles the `idun-agent-standalone` admin/chat/traces app and the `idun` console script, so adopters can `pip install idun-agent-engine && idun setup && idun serve` without installing any other package. The release also removes the Haystack adapter, demotes `guardrails-ai` to an optional extra, lands the trace pipeline that powers the admin `/traces/` viewer, and rebrands the public surface from "Idun Platform" to "Idun Engine".

See the README's "Bundled install" section for what is in the wheel and how `idun-agent-engine`, `idun-agent-standalone`, and `idun-agent-schema` relate. Full launch context: [The third path](https://idun-group.com/blog/2026-05-17-third-path-engine-v0.6).

### Added

**Observability**

- Standalone trace store: schema, asyncpg writer, REST endpoints, list + detail UI (#606, #607, #608).
- ADK adapter spans projected onto OpenInference attributes so they flow through the same trace pipeline as LangGraph spans (#609).
- `GoogleGenAIInstrumentor` auto-attached for Gemini cache-bucket capture (#622).
- `BaseAgent.register_run_event_observer(observer)`: async callbacks receive every AG-UI event from `/agent/run` before SSE encoding. Per-observer exceptions are isolated and logged via `logger.exception`; they never break the SSE stream. Route-synthesized `RunErrorEvent` fallbacks are not dispatched (observers see only events yielded by the agent itself).
- Lifecycle helper and `user.id` carry-through for standalone trace ingestion (#601).

**Health and readiness**

- `/health` reflects engine assembly state. The endpoint returns `agent_ready: bool` and `status: "degraded"` when configured agents failed to come online, instead of always `{"status":"ok"}` (#636). This addresses an L10 finding where operators were silently shipping broken services.

**Hosting and packaging**

- `IDUN_UI_DIR` environment variable: when set to a readable directory, the engine mounts it at `/` as `StaticFiles(html=True)`. The previous JSON info payload is reachable at `/_engine/info`; `/` falls back to the same payload only when no static UI is mounted.
- `create_app(..., reload_auth=...)`: pluggable FastAPI dependency for the `POST /reload` endpoint. The configured callable (sync or async) is responsible for raising `HTTPException` to deny a request. `None` (default) keeps the previous unprotected behavior for back-compat.

**OpenAPI surface**

- Routers re-tagged into coherent bundles for `/docs` grouping. Engine routers (`/agent/*`, base, chat-channel webhooks) carry the `Runtime` tag; standalone routers split across Admin, Traces, Health, and MCP bundles.

### Changed

- **The engine wheel now bundles standalone and schema.** `pip install idun-agent-engine` ships the `idun` console script (mapped to `idun_agent_standalone.cli:main`), the chat/admin/traces Next.js bundle, alembic migrations, and `idun-agent-schema` as a runtime dependency. The README has a new section explaining the bundle and a note on PyPI's JSON-API rendering quirk that hides this from `requires_dist` (#632, #646).
- **`guardrails-ai` is now an optional extra (`[guardrails]`).** Install with `pip install idun-agent-engine[guardrails]` to use the engine's Guardrails-AI integration. Removing it from the default install footprint unblocks PyPI's quarantine policy on transitive deps and trims the cold-start surface for adopters who do not need it (#642).
- **Standalone admin DB rework.** Schema and migrations rebuilt for the production admin path (#566). Existing standalone deployments must run `idun setup` after upgrade to apply the new migrations.
- `BaseAgent.__init__` now exists and instantiates the observer registry. All built-in adapters (`LanggraphAgent`, `AdkAgent`) call `super().__init__()` so the registry is available on every agent instance.

### Deprecated

- **`/agent/invoke`** is marked `deprecated=True` in OpenAPI. Migrate to `POST /agent/run` (AG-UI SSE stream contract). The old endpoint still works for back-compat; removal is targeted for 0.7.

### Removed

- **Haystack agent adapter**, `HaystackAgentConfig` schema, the `langfuse-haystack` runtime dependency, and all related tests, docs, and UI surfaces (#570, #576). Migrate Haystack agents to LangGraph or ADK before upgrading.

### Fixed

- MCP tool calls are wrapped so AG-UI can serialize event payloads end to end (#599).
- Guardrail install failures surface to the reload pipeline instead of silently degrading the running agent (#595).
- ADK app-name-mismatch warning silenced (false positive in single-agent deploys) (#624).
- Pydantic 2.12 warning filter restored at the correct import site and applied earliest (#612).
- Trace pipeline no longer drops trace rows when the runtime OTel context leaks a parent. Fixed by isolating the LangChain instrumentor's runtime-context handling and guarding against SDK drift (#620).
- Prompts resolve from the `EngineConfig` snapshot in standalone, mirroring the MCP registry pattern (#625).
- Post-#609 follow-ups: langchain version pin, instrumentor health checks, LangGraph chat-mode regression, doc corrections (#611).

### Security

- All third-party GitHub Actions pinned to SHAs, dep-audit job added, `SECURITY.md` hardened (#638).
- Socket security gates wired into PRs and into both publish workflows (#634).
- Next.js and aiohttp CVE patches; `pinact` pre-commit hook (#641).
- `guardrails-ai` moved out of the default install footprint (see Changed) (#642).

### Build, CI, and release tooling

- `scripts/check-wheel-metadata.sh`: asserts the engine wheel's bundling contract (entry_points wiring, `idun_agent_standalone` force-include, `idun-agent-schema` runtime dep). Wired into both `publish_engine_testpypi.yml` and `release.yml` between build and twine check (#646).
- `e2e-real-llm.yml`: real-LLM end-to-end suite covering LangGraph and ADK adapters across chat, streaming, multi-turn, tool-call, guardrail-block, and MCP roundtrip scenarios (#577, #579, #580, #581, #591, #593).
- Migration CI + dependency cleanup (#572).

### Upgrading from 0.5.x

1. **Drop any separate install of `idun-agent-standalone`.** It is now bundled in the engine wheel. Uninstall the standalone wheel (or remove it from your requirements) before installing `0.6.0` to avoid two copies of the same package.
2. **Install `[guardrails]` extra if you use Guardrails-AI.** `pip install idun-agent-engine[guardrails]==0.6.0`. Without the extra, agents with `guardrails:` config blocks refuse to assemble with a clear error message.
3. **Migrate Haystack agent configs.** Haystack support is gone. Existing Haystack `framework: haystack` configs will fail to parse. LangGraph and ADK are the supported frameworks.
4. **Switch smoke checks to `POST /agent/run`.** `/agent/invoke` still works but is deprecated and will be removed in 0.7. Smoke tests using `curl /health` keep working but no longer prove the agent is assembled (see the `/health` semantics change below).
5. **Run `idun setup` after upgrade** so the new standalone admin DB migrations apply.
6. **`/health` semantics changed.** Existing readiness probes that only check HTTP 200 keep working. New keys `agent_ready: bool` and `status: "degraded"` let operators distinguish "process up" from "agent serving".
