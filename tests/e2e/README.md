# tests/e2e — real-agents real-LLM end-to-end suite

This directory exercises the standalone end-to-end with real OpenAI and Gemini API keys. It is **not** part of the default `make test` / `make ci` runs; it is gated behind `OPENAI_API_KEY` plus `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) being set in the environment.

The suite spawns a real `idun init --no-browser` subprocess per scenario, hits `/agent/run` and `/admin/api/v1/*` over HTTP, parses the AG-UI SSE wire format, and asserts loose contracts (event-shape, response-substring, JSON-schema parse) — never exact-string LLM output.

## Run locally

```bash
# Required env vars
export OPENAI_API_KEY=...
export GEMINI_API_KEY=...        # AI Studio's modern naming; GOOGLE_API_KEY also accepted
export GUARDRAILS_API_KEY=...    # for the reload-pipeline scenario

# Run a single pair shard (~25-50s wall-clock)
uv run pytest tests/e2e/ -v --pair=lg-openai
uv run pytest tests/e2e/ -v --pair=lg-gemini
uv run pytest tests/e2e/ -v --pair=adk-gemini

# Run a single scenario
uv run pytest tests/e2e/scenarios/test_tool_call.py --pair=lg-openai -v

# Run the helper unit tests (no LLM, fast)
uv run pytest tests/e2e/helpers/ -v
```

If neither `OPENAI_API_KEY` nor a Gemini key is set, the entire suite skips at session start.

## Layout

```text
tests/e2e/
├── conftest.py                       # session + per-scenario fixtures
├── helpers/
│   ├── aguievents.py                 # SSE parser + loose-assertion vocab
│   ├── judge.py                      # binary YES/NO LLM judge (gpt-5.4-mini)
│   └── test_*.py                     # offline unit tests
├── fixtures/
│   ├── agents/                       # provider-agnostic agent modules
│   └── configs/                      # Jinja2 YAML templates
└── scenarios/
    └── test_*.py                     # one file per scenario
```

## Pairs (SPEC §5.1)

| Pair | Adapter | Provider | Model |
|------|---------|----------|-------|
| `lg-openai` | LangGraph | OpenAI | `gpt-5.4-mini` |
| `lg-gemini` | LangGraph | Google AI Studio | `gemini-3-flash-preview` |
| `adk-gemini` | Google ADK | Google AI Studio | `gemini-3-flash-preview` |

Pair selection is via `--pair=<name>` (CLI) or `E2E_PAIR=<name>` (env). Default behavior (no flag, no env) is "all pairs" — but every scenario uses `@pytest.mark.pair(...)` markers to opt into specific pairs, so the conftest filters down at collection time.

## Scenarios (SPEC §5)

| # | Scenario | LG+OpenAI | LG+Gemini | ADK+Gemini |
|---|---|:---:|:---:|:---:|
| 1 | chat happy path | ✅ | ✅ | ✅ |
| 2 | streaming SSE shape | ✅ | ✅ | ✅ |
| 3 | tool call (calculator) | ✅ | ✅ | ✅ * |
| 4 | multi-turn (judge-asserted) | ✅ | ✅ | ✅ |
| 5 | guardrail block (boot-time YAML) | DEFERRED | — | — |
| 6 | MCP roundtrip | DEFERRED | — | DEFERRED |
| 7 | reload pipeline (admin REST) | ✅ | — | — |
| 8 | structured output | ✅ | ✅ | — |
| 9 | prompt templating | ✅ | ✅ | — |

\* ADK+Gemini correctly issues the tool call but doesn't synthesize a follow-up text — tested via `_assert_result_visible` accepting either `TEXT_MESSAGE_CONTENT` or `TOOL_CALL_RESULT.content`.

**Deferred scenarios** (5, 6, ADK MCP) are blocked on a standalone seeder gap tracked as T1 priority in `tasks/idun-rework-roadmap-08-05-2026/TODO.md`. The seeder currently materializes only `StandaloneAgentRow` and `StandaloneMemoryRow` from YAML; `guardrails:` and `mcp_servers:` blocks are silently dropped. Once that's fixed, un-defer SPEC §5 rows 5 + 6.

## Adding a scenario

1. **Decide pair scope.** Use `@pytest.mark.pair("lg-openai", ...)` to opt into pairs.
2. **Reuse fixtures.** Most scenarios consume `agent_lg_chat.py` (LangGraph chat, no tools) or `agent_adk_chat.py` (ADK minimal). New fixtures only when the scenario needs novel agent shape (e.g. tool variants, MCP, guardrails).
3. **Loose assertions only.** Reach for `assert_envelope_complete`, `assert_event_sequence`, `assert_response_contains`, `assert_tool_called_once`, `assert_json_schema_valid`. Reach for the `judge` helper only when no loose assertion can catch the regression (current usage: scenario 4 only).
4. **Match the conftest's idioms.** `pair`, `render_config`, `standalone_with_config` are the three fixtures every scenario uses. `tmp_path` is implicit in pytest.
5. **If the scenario requires UI-driven coverage**, also add a Playwright spec under `services/idun_agent_standalone_ui/e2e/` (per CONTRIBUTING.md).

## Adding a fixture

- Python agent modules go in `fixtures/agents/`. They must NOT use `from __future__ import annotations` — the engine's `importlib.util.spec_from_file_location` loader can't resolve PEP-563 deferred refs in TypedDict-shaped state schemas. Eager annotations work.
- YAML templates go in `fixtures/configs/`. Use Jinja2 with `StrictUndefined` (the conftest's `render_config` enforces this — undeclared template vars fail loudly).
- Provider-agnostic Python code reads `E2E_PROVIDER` / `E2E_MODEL` from env. The conftest's `_spawn_idun` exports those based on the active pair.

## Debugging a hung subprocess

The `standalone_with_config` fixture pipes the subprocess's stdout, drains it in a background thread (bounded `deque(maxlen=2000)`), and dumps the last ~4000 chars on failure. If a test hangs without surfacing output:

1. Check the standalone is binding the port: `lsof -iTCP -sTCP:LISTEN -n -P | grep <port>`.
2. Increase the health-poll timeout in `conftest.py::_wait_for_health` if your machine is slow (default 45s).
3. Re-run with `-s` to stream stdout live: `uv run pytest tests/e2e/scenarios/<file>.py --pair=<pair> -v -s`.
4. The conftest forces `GOOGLE_GENAI_USE_VERTEXAI=false` in the subprocess env. If you're seeing Vertex ADC errors, your host `.env` may be exporting `GOOGLE_GENAI_USE_VERTEXAI=TRUE` and `uv run` is auto-loading it — but the conftest override should win.
5. `idun init` boots in ~5-10s on a warm cache, ~15-30s cold. If boot consistently exceeds 30s in CI, file an issue — the 45s health timeout has margin but not infinite.

## Cost (SPEC §7.4)

Projected at ~80 PR runs/month × 17 LLM-driven invocations × ~500 tokens × cheapest tier (`gpt-5.4-mini` + `gemini-3-flash-preview`): **< $1/month**. No cost circuit breaker in v1.

## CI

`.github/workflows/e2e-real-llm.yml` runs the full pytest matrix (3 pairs in parallel) plus the 2 Playwright specs on every PR to `main`/`develop`. Auto-skips on fork PRs (secrets gate).

## References

- SPEC: `tasks/e2e-real-agents-08-05-2026/SPEC.md` (in `Idun-Group/idun-dev`)
- PLAN: `tasks/e2e-real-agents-08-05-2026/PLAN.md` (in `Idun-Group/idun-dev`)
- Roadmap: `tasks/idun-rework-roadmap-08-05-2026/TODO.md` (in `Idun-Group/idun-dev`)
- Engine adapters: `libs/idun_agent_engine/CLAUDE.md`
- Standalone CLI: `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py`
