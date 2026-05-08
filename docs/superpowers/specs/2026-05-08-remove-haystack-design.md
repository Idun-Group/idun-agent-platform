# Remove Haystack Support — Design

**Date**: 2026-05-08
**Branch**: `chore/remove-haystack-support` (off `origin/develop`)
**Type**: feature removal / cleanup

## Goal

Remove all Haystack adapter code, configuration, dependencies, tests, examples, and documentation from the Idun Agent Platform monorepo. Stop supporting Haystack as a runtime framework.

## Why

The Haystack adapter has been carried as "experimental, basic invoke only" since inception:

- No streaming (no AG-UI event mapping).
- No CopilotKit support.
- No `list_sessions` / `get_session` (the sessions router special-cases it as the canonical 501 example).
- Drags in `haystack-ai`, `haystack-experimental`, and `langfuse-haystack` as install-time dependencies.

Maintenance cost (deps, dispatch branches in schema/engine/standalone/UI, dedicated tests, an example dir, docstrings) is non-trivial relative to value delivered. The platform has converged on LangGraph (primary) + Google ADK (mature secondary). Haystack does not justify a place in the supported set.

## Non-goals

- No version bumps in this PR. Versions move on the `develop → main` release PR.
- No Alembic migration. The standalone admin DB stores agent configs as JSONB and `managed_memory.agent_framework` is a free-form `String(255)`; there is no DB-level enum to alter.
- No deprecation period. The adapter has been labeled experimental from day one and is removed cleanly.
- `old-docs/` is left untouched (archived per repo conventions).

## What breaks (and the user-visible failure mode)

- A YAML config with `agent.type: haystack` fails Pydantic validation at `EngineConfig` load time with a discriminator error.
- A standalone install whose seeded DB row has `agent.type == "HAYSTACK"` fails on the next reload via `services/engine_config.assemble_engine_config` for the same reason. The reload is rejected, the existing engine keeps running, and `runtime_state` records the failure.
- Both surfaces are acceptable: the adapter was experimental, no streaming/UX path existed, and the validation error is precise.

## Scope by package

### 1. `libs/idun_agent_schema`

| File | Change |
| --- | --- |
| `src/idun_agent_schema/engine/haystack.py` | Delete |
| `src/idun_agent_schema/engine/agent.py` | Drop `HaystackAgentConfig` import, remove from the `AgentConfig` discriminated union, drop the `AgentFramework.HAYSTACK` validator branch |
| `src/idun_agent_schema/engine/agent_framework.py` | Remove `HAYSTACK = "HAYSTACK"` enum member |
| `tests/standalone/test_onboarding.py` | Replace the two `framework="HAYSTACK"` references with a clearly-fictional value (e.g. `"FOOBAR"`) so the "rejects unsupported framework" intent stays explicit |
| `CLAUDE.md` | Remove the `HaystackAgentConfig` row from the schema table |

### 2. `libs/idun_agent_engine`

| File / path | Change |
| --- | --- |
| `src/idun_agent_engine/agent/haystack/` | Delete the entire package (`__init__.py`, `haystack.py`, `utils.py`) |
| `src/idun_agent_engine/core/config_builder.py` | Remove the `HaystackAgentConfig` import and the `HaystackAgent` dispatch branch |
| `src/idun_agent_engine/server/routers/agent.py` (line 100 docstring) | Drop the "(Haystack, …)" example from the 501 description |
| `pyproject.toml` | Remove `"langfuse-haystack>=2.3.0"` |
| `uv.lock` | Regenerate (`uv lock`) — drops `langfuse-haystack`, `haystack-ai`, `haystack-experimental` |
| `examples/04_haystack_example/` | Delete (`agent.py`, `config.yaml`, `pipe.py`, `main.py`, `.env.example`) |
| `examples/05_agui_copilotkit/README.md` | Remove the Haystack mention |
| `tests/unit/agent/test_haystack.py` | Delete |
| `tests/fixtures/agents/mock_haystack_pipeline.py` | Delete |
| `tests/unit/core/test_config_builder.py` | Delete `test_initialize_agent_haystack_pipeline` and `test_initialize_agent_haystack_agent` (LangGraph + ADK still cover dispatch) |
| `tests/unit/server/routers/agent/test_agent_routes.py` | Delete `test_invoke_with_haystack_agent` |
| `tests/unit/server/routers/agent/test_graph_route.py` | Replace `_haystack_app()` with an `_adk_app()` builder using the existing `tests/fixtures/agents/mock_adk_agent.py` fixture; rename the three `*_404_for_haystack` tests to `*_404_for_non_langgraph` so the intent ("graph endpoints return 404 for adapters without a LangGraph IR") stays clear |
| `tests/integration/server/test_sessions_routes.py` | Replace `_install_stub_agent(app, agent_type="Haystack")` with `agent_type="ADK"` in both 501 tests; update the asserted `body["detail"]["agent_type"]` |
| `tests/utils.py` | Drop the `"haystack"` example from the docstring |
| `CLAUDE.md` | Remove Haystack from the intro paragraph, the module map (`agent/haystack/` row), and the adapter table (`HaystackAgent` row) |
| `CHANGELOG.md` | Add a top-of-file `### Removed` entry: "Haystack adapter, schema, and dependencies." |

### 3. `libs/idun_agent_standalone`

| File | Change |
| --- | --- |
| `src/` | No source references — no change |
| `tests/unit/services/test_scanner.py` (line 455) | Replace `"type": "HAYSTACK"` with `"type": "FOOBAR"` so `test_idun_config_unsupported_type_skipped` stays future-proof |
| `tests/unit/services/test_connection_checks.py` (line 42) | Replace `check_memory("HAYSTACK", …)` with `check_memory("FOOBAR", …)` for `test_memory_unsupported_framework_fails` |

### 4. `services/idun_agent_standalone_ui`

| File | Change |
| --- | --- |
| `lib/api/types/graph.ts` | Drop `"HAYSTACK"` from the `framework` union |
| `lib/api/types/memory.ts` | Drop `"HAYSTACK"` from the framework union |
| `components/admin/provider-icons.tsx` | Delete `HaystackIcon` and any imports/callers (verify with `rg HaystackIcon`) |

### 5. Repo-level docs

| File | Change |
| --- | --- |
| `ROADMAP.md` (line 11) | Drop "Haystack compatibility foundation" from the agent-frameworks bullet |
| `docs/.mintlify/Assistant.md` (line 36) | Drop the Haystack mention from the supported-frameworks guidance |
| `docs/api-reference/openapi.json` | Regenerate from the updated schema (drops the `"HAYSTACK"` enum value at line 3777) |
| `old-docs/**` | No change (archived) |

## Verification

The following must pass before the PR is opened:

- `make lint` — ruff clean
- `make mypy` — engine type-clean
- `uv run pytest libs/idun_agent_schema/tests` — schema tests green
- `uv run pytest libs/idun_agent_engine/tests -m "not requires_langfuse and not requires_phoenix and not requires_postgres"` — engine inner-loop green
- `uv run pytest libs/idun_agent_standalone/tests` — standalone tests green
- `cd services/idun_agent_standalone_ui && pnpm typecheck` — UI types compile
- `rg -i 'haystack' -- libs services docs ROADMAP.md CLAUDE.md` — only `old-docs/` and `CHANGELOG.md` matches remain
- `uv lock` reproduces a haystack-free lock (`rg 'haystack' libs/idun_agent_engine/uv.lock` returns no hits)

## Out of scope

- Deprecation warnings in older releases. We are removing cleanly on `develop`.
- Migrations or scripts that rewrite stored configs. Operators with a Haystack-typed agent in their standalone DB delete the row manually; failure mode is loud and contained.
- `idun-agent-engine` PyPI yanks of older versions. Prior releases continue to ship Haystack support; only `develop` and the next release stop shipping it.
