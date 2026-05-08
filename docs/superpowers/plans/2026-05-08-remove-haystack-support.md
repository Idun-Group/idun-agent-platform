# Remove Haystack Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-remove the Haystack adapter, schema, dependencies, tests, examples, and docs across the monorepo in a single PR.

**Architecture:** Mechanical deletion + reference cleanup, propagated in source-of-truth order: schema → engine source → engine deps/examples → standalone tests → UI types → repo docs. No version bumps (deferred to release PR), no Alembic migration (configs are JSONB, no DB enum constraint), no deprecation period (adapter has always been experimental).

**Tech Stack:** Python (uv, pytest, ruff, black, mypy), TypeScript / Next.js (pnpm), Pydantic 2.11+, FastAPI, LangGraph + ADK adapters remain.

**Companion spec:** `docs/superpowers/specs/2026-05-08-remove-haystack-design.md`

---

## Task 0: Establish a green baseline

**Goal:** Confirm the inherited state from `origin/develop` is clean before any change. If anything fails here, stop and surface it — it is not caused by this PR.

**Files:** none (read-only verification)

- [ ] **Step 1: Confirm branch + remote tracking**

```bash
git rev-parse --abbrev-ref HEAD          # → chore/remove-haystack-support
git rev-parse HEAD                        # capture for comparison later
git status --short                        # → empty
```

Expected: branch is `chore/remove-haystack-support`, working tree is clean.

- [ ] **Step 2: Run the schema unit tests**

```bash
uv run pytest libs/idun_agent_schema/tests/ -q
```

Expected: all green.

- [ ] **Step 3: Run the engine inner-loop tests (skip external services)**

```bash
uv run pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: all green.

- [ ] **Step 4: Run the standalone tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/ -q
```

Expected: all green.

- [ ] **Step 5: Run lint + mypy**

```bash
make lint
make mypy
```

Expected: both clean.

- [ ] **Step 6: Run the UI type-check**

```bash
cd services/idun_agent_standalone_ui && pnpm install --frozen-lockfile && pnpm typecheck && cd ../..
```

Expected: clean (no TypeScript errors). If `pnpm typecheck` is not a script, try `pnpm tsc --noEmit`.

- [ ] **Step 7: Capture the haystack reference inventory**

```bash
rg -i 'haystack' -- libs services docs ROADMAP.md CLAUDE.md \
   --glob '!**/uv.lock' --glob '!old-docs/**' --glob '!**/node_modules/**' --glob '!**/.venv/**'
```

Expected: matches in the files listed in the spec, nothing else. This is the demolition list — every match (outside `old-docs/` and `CHANGELOG.md`) must be gone by the end of Task 7.

---

## Task 1: Strip Haystack from the schema

**Goal:** Remove `HaystackAgentConfig`, the `HAYSTACK` enum value, the discriminated-union member, and the validator branch. Update the `tests/standalone` reference and the schema CLAUDE.md.

**Files:**
- Delete: `libs/idun_agent_schema/src/idun_agent_schema/engine/haystack.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/agent.py`
- Modify: `libs/idun_agent_schema/src/idun_agent_schema/engine/agent_framework.py`
- Modify: `libs/idun_agent_schema/tests/standalone/test_onboarding.py`
- Modify: `libs/idun_agent_schema/CLAUDE.md`

- [ ] **Step 1: Delete the Haystack config module**

```bash
git rm libs/idun_agent_schema/src/idun_agent_schema/engine/haystack.py
```

- [ ] **Step 2: Update `engine/agent.py` — remove the import, the union member, the validator branch**

Replace the entire current contents of `libs/idun_agent_schema/src/idun_agent_schema/engine/agent.py` with:

```python
"""Common agent model definitions (engine)."""

from pydantic import BaseModel, model_validator

from idun_agent_schema.engine.adk import AdkAgentConfig
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.base_agent import BaseAgentConfig
from idun_agent_schema.engine.langgraph import LangGraphAgentConfig
from idun_agent_schema.engine.templates import (
    CorrectionAgentConfig,
    DeepResearchAgentConfig,
    TranslationAgentConfig,
)


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: AgentFramework
    config: (
        LangGraphAgentConfig
        | AdkAgentConfig
        | TranslationAgentConfig
        | CorrectionAgentConfig
        | DeepResearchAgentConfig
        | BaseAgentConfig
    )

    @model_validator(mode="after")
    def _validate_framework_config(self) -> "AgentConfig":
        """Ensure the `config` type matches the selected framework.

        - LANGGRAPH  -> LangGraphAgentConfig
        - ADK        -> AdkAgentConfig
        - TRANSLATION_AGENT -> TranslationAgentConfig
        - CORRECTION_AGENT -> CorrectionAgentConfig
        - DEEP_RESEARCH_AGENT -> DeepResearchAgentConfig
        - CREWAI/CUSTOM -> BaseAgentConfig (or subclass)
        """
        expected_type: type[BaseAgentConfig] | None = None

        if self.type == AgentFramework.LANGGRAPH:
            expected_type = LangGraphAgentConfig
        elif self.type == AgentFramework.TRANSLATION_AGENT:
            expected_type = TranslationAgentConfig
        elif self.type == AgentFramework.ADK:
            expected_type = AdkAgentConfig
        elif self.type == AgentFramework.CORRECTION_AGENT:
            expected_type = CorrectionAgentConfig
        elif self.type == AgentFramework.DEEP_RESEARCH_AGENT:
            expected_type = DeepResearchAgentConfig
        elif self.type in {AgentFramework.CREWAI, AgentFramework.CUSTOM}:
            expected_type = BaseAgentConfig

        if expected_type is not None and not isinstance(self.config, expected_type):
            raise ValueError(
                f"config must be {expected_type.__name__} when type is {self.type}"
            )

        return self
```

- [ ] **Step 3: Update `engine/agent_framework.py` — drop the enum value**

Replace the entire current contents of `libs/idun_agent_schema/src/idun_agent_schema/engine/agent_framework.py` with:

```python
"""Agent framework enumeration (engine)."""

from enum import Enum


class AgentFramework(str, Enum):
    """Supported agent frameworks for engine."""

    LANGGRAPH = "LANGGRAPH"
    ADK = "ADK"
    CREWAI = "CREWAI"
    CUSTOM = "CUSTOM"
    TRANSLATION_AGENT = "TRANSLATION_AGENT"
    CORRECTION_AGENT = "CORRECTION_AGENT"
    DEEP_RESEARCH_AGENT = "DEEP_RESEARCH_AGENT"
```

- [ ] **Step 4: Update the standalone onboarding test**

In `libs/idun_agent_schema/tests/standalone/test_onboarding.py`, replace both occurrences of `framework="HAYSTACK"` with `framework="FOOBAR"`. Use a global replace inside this file:

```bash
python - <<'PY'
from pathlib import Path
p = Path("libs/idun_agent_schema/tests/standalone/test_onboarding.py")
text = p.read_text()
new = text.replace('framework="HAYSTACK"', 'framework="FOOBAR"')
assert new != text, "no replacement happened"
p.write_text(new)
PY
```

If the replacement produces a `# type: ignore[arg-type]` left orphaned (i.e., the literal was previously typed as `AgentFramework`), keep the comment — `"FOOBAR"` is intentionally not a valid framework value and the test asserts that the system rejects it.

- [ ] **Step 5: Update the schema CLAUDE.md**

In `libs/idun_agent_schema/CLAUDE.md`:

a. In the **Core Config Hierarchy** code block, change the line

```
│   ├── type: AgentFramework    #   LANGGRAPH | ADK | HAYSTACK | ...
```

to:

```
│   ├── type: AgentFramework    #   LANGGRAPH | ADK | ...
```

b. In the **Agent Framework Configs** table, delete the row:

```
| `HaystackAgentConfig` | `haystack.py` | `component_type` (pipeline\|agent), `component_definition` (str) |
```

c. In the **`AgentFramework` enum** list, change

```
**`AgentFramework`** enum (`agent_framework.py`): `LANGGRAPH`, `ADK`, `HAYSTACK`, `CREWAI`, `CUSTOM`, `TRANSLATION_AGENT`, `CORRECTION_AGENT`, `DEEP_RESEARCH_AGENT`
```

to:

```
**`AgentFramework`** enum (`agent_framework.py`): `LANGGRAPH`, `ADK`, `CREWAI`, `CUSTOM`, `TRANSLATION_AGENT`, `CORRECTION_AGENT`, `DEEP_RESEARCH_AGENT`
```

- [ ] **Step 6: Verify the schema tree no longer references Haystack**

```bash
rg -i 'haystack' libs/idun_agent_schema/
```

Expected: no matches.

- [ ] **Step 7: Run the schema tests**

```bash
uv run pytest libs/idun_agent_schema/tests/ -q
```

Expected: green. Pay attention to `test_onboarding.py` — the unsupported-framework test must still pass with `"FOOBAR"`.

- [ ] **Step 8: Lint the schema package**

```bash
uv run ruff check libs/idun_agent_schema/
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add libs/idun_agent_schema/
git status --short        # confirm only schema files staged
git commit -m "$(cat <<'EOF'
chore(schema): remove Haystack agent config and enum value

Drops HaystackAgentConfig, the HAYSTACK enum member, the
discriminated-union arm, and the validator branch. Updates the
standalone onboarding test to a fictional framework name so the
"unsupported framework rejected" intent stays explicit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Strip Haystack from the engine source

**Goal:** Delete the engine adapter package and the dispatch branch in `config_builder.py`. Tidy the only docstring that still references Haystack.

**Files:**
- Delete: `libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/__init__.py`
- Delete: `libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/haystack.py`
- Delete: `libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/utils.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/core/config_builder.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`

- [ ] **Step 1: Delete the adapter package**

```bash
git rm -r libs/idun_agent_engine/src/idun_agent_engine/agent/haystack/
```

- [ ] **Step 2: Update the imports in `core/config_builder.py`**

Open `libs/idun_agent_engine/src/idun_agent_engine/core/config_builder.py`. Delete this line (currently line 16):

```python
from idun_agent_schema.engine.haystack import HaystackAgentConfig
```

- [ ] **Step 3: Delete the HAYSTACK dispatch branch in `core/config_builder.py`**

Around line 401 the file has:

```python
        elif agent_type == AgentFramework.HAYSTACK:
            from idun_agent_engine.agent.haystack.haystack import HaystackAgent

            try:
                validated_config = HaystackAgentConfig.model_validate(agent_config_obj)

            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a HaystackAgentConfig model. Got {agent_config_obj}"
                ) from e
            agent_instance = HaystackAgent()
        elif agent_type == AgentFramework.ADK:
```

Delete the whole `elif agent_type == AgentFramework.HAYSTACK:` block so the file reads:

```python
            agent_instance = LanggraphAgent()

        elif agent_type == AgentFramework.ADK:
```

(i.e., the `elif AgentFramework.ADK:` branch follows immediately after the previous `LanggraphAgent()` assignment).

- [ ] **Step 4: Update the docstring in `server/routers/agent.py`**

Around line 100 in `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`, the docstring currently reads:

```python
    """List session summaries from the active memory backend.

    Returns 501 when the adapter doesn't support listing (Haystack, or a
    LangGraph agent without a checkpointer). When SSO is enabled, the
    user id from the JWT is forwarded to the adapter for per-user scoping.
    """
```

Replace with:

```python
    """List session summaries from the active memory backend.

    Returns 501 when the adapter doesn't support listing (an ADK agent,
    or a LangGraph agent without a checkpointer). When SSO is enabled,
    the user id from the JWT is forwarded to the adapter for per-user
    scoping.
    """
```

(The 501 example shifts from Haystack to ADK — ADK currently does not implement `list_sessions` either, so the example is still accurate.)

- [ ] **Step 5: Confirm engine source no longer imports anything Haystack**

```bash
rg -n 'haystack' libs/idun_agent_engine/src/
```

Expected: no matches.

- [ ] **Step 6: Lint to catch unused imports / dead branches**

```bash
uv run ruff check libs/idun_agent_engine/src/idun_agent_engine/
```

Expected: clean.

- [ ] **Step 7: Type-check the engine**

```bash
make mypy
```

Expected: clean. (Engine tests will fail until Task 3 — that is expected, mypy here only walks `src/`.)

- [ ] **Step 8: Commit**

```bash
git add libs/idun_agent_engine/src/
git status --short
git commit -m "$(cat <<'EOF'
chore(engine): remove Haystack adapter source

Deletes the agent/haystack/ package and the HAYSTACK dispatch arm
in ConfigBuilder. Updates the sessions router docstring so the 501
example no longer references Haystack.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Strip Haystack from the engine tests

**Goal:** Delete the dedicated Haystack tests + fixture, drop Haystack-only test cases from shared test files, and replace Haystack stand-ins with ADK in tests that exercised "non-LangGraph adapter behavior".

**Files:**
- Delete: `libs/idun_agent_engine/tests/unit/agent/test_haystack.py`
- Delete: `libs/idun_agent_engine/tests/fixtures/agents/mock_haystack_pipeline.py`
- Modify: `libs/idun_agent_engine/tests/unit/core/test_config_builder.py`
- Modify: `libs/idun_agent_engine/tests/unit/server/routers/agent/test_agent_routes.py`
- Modify: `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py`
- Modify: `libs/idun_agent_engine/tests/integration/server/test_sessions_routes.py`
- Modify: `libs/idun_agent_engine/tests/utils.py`

- [ ] **Step 1: Delete the Haystack adapter tests + fixture**

```bash
git rm libs/idun_agent_engine/tests/unit/agent/test_haystack.py
git rm libs/idun_agent_engine/tests/fixtures/agents/mock_haystack_pipeline.py
```

- [ ] **Step 2: Drop the two Haystack tests in `test_config_builder.py`**

Open `libs/idun_agent_engine/tests/unit/core/test_config_builder.py`. Find and delete in full:

- The test function `async def test_initialize_agent_haystack_pipeline(self) -> None:` and its body.
- The test function `async def test_initialize_agent_haystack_agent(self) -> None:` and its body.

(These were two of the very few tests that imported from `idun_agent_engine.agent.haystack` — the file's other tests cover LangGraph and ADK dispatch so the framework matrix remains exercised.)

After deletion, run `uv run ruff check libs/idun_agent_engine/tests/unit/core/test_config_builder.py` and clean up any unused imports it flags.

- [ ] **Step 3: Drop the Haystack invoke test in `test_agent_routes.py`**

Open `libs/idun_agent_engine/tests/unit/server/routers/agent/test_agent_routes.py`. Find and delete in full the test function `def test_invoke_with_haystack_agent(self):` (around line 43) and its body.

After deletion, `uv run ruff check libs/idun_agent_engine/tests/unit/server/routers/agent/test_agent_routes.py` and remove any orphaned imports.

- [ ] **Step 4: Replace `_haystack_app()` with `_adk_app()` in `test_graph_route.py`**

Open `libs/idun_agent_engine/tests/unit/server/routers/agent/test_graph_route.py`. The current file defines a `_haystack_app()` builder and three tests named `test_*_404_for_haystack`. Replace as follows.

a. Delete the existing `_haystack_app()` function and its body (the function spans roughly lines 30 to 50).

b. Add this builder in its place (the fixture exposes the root agent as `mock_adk_agent_instance`):

```python
def _adk_app():
    mock_path = (
        Path(__file__).resolve().parent.parent.parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )
    config = ConfigBuilder.from_dict(
        {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "ADK",
                "config": {
                    "name": "ADK Agent",
                    "app_name": "adk_agent",
                    "agent": f"{mock_path}:mock_adk_agent_instance",
                },
            },
        }
    ).build()
    return create_app(engine_config=config)
```

c. Rename the three Haystack tests:

- `test_ir_route_404_for_haystack` → `test_ir_route_404_for_non_langgraph`
- `test_mermaid_route_404_for_haystack` → `test_mermaid_route_404_for_non_langgraph`
- `test_ascii_route_404_for_haystack` → `test_ascii_route_404_for_non_langgraph` (if it exists in the file; only rename existing tests)

In each renamed test, replace the call `app = _haystack_app()` with `app = _adk_app()`. Leave assertions unchanged.

- [ ] **Step 5: Replace `agent_type="Haystack"` with `agent_type="ADK"` in `test_sessions_routes.py`**

Open `libs/idun_agent_engine/tests/integration/server/test_sessions_routes.py`. There are four matches around lines 162, 170, 179, and 187:

```python
        _install_stub_agent(app, agent_type="Haystack")
        ...
        assert body["detail"]["agent_type"] == "Haystack"
```

Replace every `"Haystack"` literal in this file with `"ADK"`. Use a single in-file global replace:

```bash
python - <<'PY'
from pathlib import Path
p = Path("libs/idun_agent_engine/tests/integration/server/test_sessions_routes.py")
text = p.read_text()
new = text.replace('"Haystack"', '"ADK"')
assert text.count('"Haystack"') == 4, f"expected 4 matches, found {text.count('\"Haystack\"')}"
p.write_text(new)
PY
```

(The replacement preserves the test intent — ADK also does not implement `list_sessions` / `get_session` and so the 501 contract is still exercised.)

- [ ] **Step 6: Drop the Haystack example from `tests/utils.py`**

Open `libs/idun_agent_engine/tests/utils.py`. Find the docstring around line 36:

```
agent_type: The type of agent (e.g., "LANGGRAPH", "adk", "haystack").
```

Replace with:

```
agent_type: The type of agent (e.g., "LANGGRAPH", "adk").
```

- [ ] **Step 7: Confirm the engine tests no longer reference Haystack**

```bash
rg -i 'haystack' libs/idun_agent_engine/tests/
```

Expected: no matches.

- [ ] **Step 8: Run the engine tests**

```bash
uv run pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: all green. If any test asserts `"Haystack"` in detail bodies that we missed, the failure points straight to the line — fix and rerun.

- [ ] **Step 9: Commit**

```bash
git add libs/idun_agent_engine/tests/
git status --short
git commit -m "$(cat <<'EOF'
chore(engine): remove Haystack tests and rewire shared cases to ADK

Deletes the dedicated Haystack adapter test + fixture, drops the
Haystack init / invoke cases that lived alongside LangGraph and ADK
coverage, and rewires the graph-route 404 and sessions-route 501
tests to assert the same contracts against ADK instead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Drop Haystack dependencies, examples, and engine docs

**Goal:** Remove the runtime dependency, the example directory, the README cross-reference, and the engine CLAUDE.md / CHANGELOG entries. Regenerate `uv.lock` so `haystack-ai`, `haystack-experimental`, and `langfuse-haystack` disappear from the lock file.

**Files:**
- Modify: `libs/idun_agent_engine/pyproject.toml`
- Modify: `libs/idun_agent_engine/uv.lock` (regenerated)
- Delete: `libs/idun_agent_engine/examples/04_haystack_example/` (entire directory)
- Modify: `libs/idun_agent_engine/examples/05_agui_copilotkit/README.md`
- Modify: `libs/idun_agent_engine/CLAUDE.md`
- Modify: `libs/idun_agent_engine/CHANGELOG.md`

- [ ] **Step 1: Remove `langfuse-haystack` from `pyproject.toml`**

In `libs/idun_agent_engine/pyproject.toml`, delete the line:

```
    "langfuse-haystack>=2.3.0",
```

(currently line 67, in the main `[project] dependencies` array). Leave surrounding lines untouched.

- [ ] **Step 2: Regenerate the lock file**

```bash
cd libs/idun_agent_engine
uv lock
cd ../..
```

Expected: `uv.lock` is rewritten. `langfuse-haystack`, `haystack-ai`, and `haystack-experimental` are gone.

- [ ] **Step 3: Confirm the lock file no longer mentions Haystack**

```bash
rg 'haystack' libs/idun_agent_engine/uv.lock
```

Expected: no matches.

- [ ] **Step 4: Delete the Haystack example**

```bash
git rm -r libs/idun_agent_engine/examples/04_haystack_example/
```

- [ ] **Step 5: Update `examples/05_agui_copilotkit/README.md`**

Open `libs/idun_agent_engine/examples/05_agui_copilotkit/README.md`. Find the line that mentions Haystack (a single match). Delete that bullet/sentence in full. If it lives inside a list of supported frameworks ("LangGraph, ADK, Haystack"), rewrite it as "LangGraph, ADK".

- [ ] **Step 6: Update `libs/idun_agent_engine/CLAUDE.md`**

Three edits:

a. **Intro paragraph (around line 5)** — change

```
`idun_agent_engine` is a Python SDK that wraps agent frameworks (LangGraph, Google ADK, Haystack) into production-ready FastAPI services.
```

to:

```
`idun_agent_engine` is a Python SDK that wraps agent frameworks (LangGraph, Google ADK) into production-ready FastAPI services.
```

b. **Module map (around line 24)** — delete the row:

```
│   └── haystack/       # Haystack adapter. Accepts Pipeline or Agent. Basic invoke only. Experimental.
```

If the previous row (`adk/`) ends with a tree-corner glyph (`├──`) and the haystack row was the last entry under `agent/`, change the previous row's connector to the last-item glyph (`└──`) so the tree continues to render correctly.

c. **Adapter table (around line 205)** — delete the row:

```
| **HaystackAgent** | `HaystackAgentConfig` | `component_definition` → dynamic import → `Pipeline` or `Agent` | Not implemented | Not supported |
```

- [ ] **Step 7: Add a Removed entry to `CHANGELOG.md`**

Open `libs/idun_agent_engine/CHANGELOG.md`. At the top of the file (under the most recent unreleased / develop section, or as a new `## [Unreleased]` block if none exists), insert:

```markdown
### Removed

- Haystack agent adapter, `HaystackAgentConfig` schema, and the `langfuse-haystack` runtime dependency. Migrate Haystack agents to LangGraph or ADK.
```

If the changelog uses a different heading style (e.g., custom date headers), match the existing style for the topmost entry.

- [ ] **Step 8: Confirm the engine package is Haystack-free**

```bash
rg -i 'haystack' libs/idun_agent_engine/ --glob '!**/uv.lock'
rg -i 'haystack' libs/idun_agent_engine/uv.lock
```

Expected: both empty.

- [ ] **Step 9: Run the engine tests one more time as a sanity check**

```bash
uv run pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: still green.

- [ ] **Step 10: Commit**

```bash
git add libs/idun_agent_engine/
git status --short
git commit -m "$(cat <<'EOF'
chore(engine): drop langfuse-haystack dep, example, and docs

Removes the runtime dependency on langfuse-haystack (which transitively
pulls in haystack-ai and haystack-experimental), deletes the
04_haystack_example/ directory, and brings CLAUDE.md and the
copilotkit README in line with the supported frameworks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update the standalone tests

**Goal:** Replace the two `"HAYSTACK"` literals in standalone tests with a clearly-fictional framework name so the "unsupported framework rejected" intent stays explicit after the enum value is gone.

**Files:**
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`
- Modify: `libs/idun_agent_standalone/tests/unit/services/test_connection_checks.py`

- [ ] **Step 1: Update `test_scanner.py`**

In `libs/idun_agent_standalone/tests/unit/services/test_scanner.py` around line 455, the test `test_idun_config_unsupported_type_skipped` writes:

```python
"type": "HAYSTACK",
"config": {"component_definition": "./pipe.py:pipe"},
```

Replace with:

```python
"type": "FOOBAR",
"config": {"component_definition": "./pipe.py:pipe"},
```

(Only the `"type"` value changes; the test asserts `result.has_idun_config is False` and `result.detected == []`, which holds for any framework not in the enum.)

- [ ] **Step 2: Update `test_connection_checks.py`**

In `libs/idun_agent_standalone/tests/unit/services/test_connection_checks.py` around line 42, the test `test_memory_unsupported_framework_fails` reads:

```python
result = await connection_checks.check_memory("HAYSTACK", {"type": "memory"})
assert result.ok is False
assert "unsupported agent framework" in result.error
```

Replace `"HAYSTACK"` with `"FOOBAR"`. Leave the rest of the test untouched.

- [ ] **Step 3: Confirm standalone tests no longer reference Haystack**

```bash
rg -i 'haystack' libs/idun_agent_standalone/
```

Expected: no matches.

- [ ] **Step 4: Run the standalone tests**

```bash
uv run pytest libs/idun_agent_standalone/tests/ -q
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_standalone/tests/
git status --short
git commit -m "$(cat <<'EOF'
chore(standalone): rewire two unsupported-framework tests off HAYSTACK

The scanner and connection-checks tests previously used "HAYSTACK" as
the canonical example of an unsupported framework. Swaps to a clearly
fictional value so the test intent stays explicit after the enum value
is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Strip Haystack from the standalone UI

**Goal:** Remove `"HAYSTACK"` from the framework union types and delete the `HaystackIcon` component (which has no in-tree caller).

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api/types/graph.ts`
- Modify: `services/idun_agent_standalone_ui/lib/api/types/memory.ts`
- Modify: `services/idun_agent_standalone_ui/components/admin/provider-icons.tsx`

- [ ] **Step 1: Update `lib/api/types/graph.ts`**

Around line 62, the file has:

```ts
  framework: "LANGGRAPH" | "ADK" | "HAYSTACK";
```

Change to:

```ts
  framework: "LANGGRAPH" | "ADK";
```

- [ ] **Step 2: Update `lib/api/types/memory.ts`**

Around line 5, the file has a multi-line union:

```ts
  | "HAYSTACK"
```

Delete that line. The neighbouring `|` operators continue to compose a valid union.

- [ ] **Step 3: Delete `HaystackIcon` from `provider-icons.tsx`**

In `services/idun_agent_standalone_ui/components/admin/provider-icons.tsx`, delete the entire export block (currently around lines 74–80):

```tsx
export function HaystackIcon(p: IconProps) {
  return (
    <RemoteBrandTile
      domain="deepset.ai"
      alt="Haystack"
      {...p}
    />
  );
}
```

- [ ] **Step 4: Verify no in-tree caller imports `HaystackIcon`**

```bash
rg 'HaystackIcon' services/idun_agent_standalone_ui/
```

Expected: no matches. (We confirmed this in design — the export had no in-tree caller. If a match appears, delete that import + caller too before continuing.)

- [ ] **Step 5: Confirm UI no longer references Haystack**

```bash
rg -i 'haystack' services/idun_agent_standalone_ui/ --glob '!**/node_modules/**'
```

Expected: no matches.

- [ ] **Step 6: Run the UI type check**

```bash
cd services/idun_agent_standalone_ui && pnpm typecheck && cd ../..
```

Expected: clean. (If `pnpm typecheck` is not a script in `package.json`, fall back to `pnpm tsc --noEmit`.)

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_standalone_ui/
git status --short
git commit -m "$(cat <<'EOF'
chore(ui): drop HAYSTACK from framework types and remove HaystackIcon

Updates the frontend framework unions in graph.ts and memory.ts to
match the schema's reduced framework set, and deletes the unused
HaystackIcon component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Strip Haystack from repo-level docs

**Goal:** Remove the last user-visible Haystack mentions in `ROADMAP.md`, the Mintlify Assistant guide, and the `docs/api-reference/openapi.json` snapshot. Leave `old-docs/` untouched.

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/.mintlify/Assistant.md`
- Modify: `docs/api-reference/openapi.json`

- [ ] **Step 1: Update `ROADMAP.md`**

Around line 11 the file has a bullet such as:

```
- **Agent frameworks**: LangGraph, ADK, Haystack compatibility foundation (...)
```

Rewrite the bullet to drop the Haystack reference. The cleanest replacement:

```
- **Agent frameworks**: LangGraph and Google ADK
```

(If the original bullet has more text after the framework names, preserve everything after the comma list while removing only the `, Haystack ...` clause.)

- [ ] **Step 2: Update `docs/.mintlify/Assistant.md`**

Around line 36 the file has:

```
- For questions about supported agent frameworks, clarify that LangGraph and ...
```

Read the line in full and remove any "Haystack" mention. The intent of the line is to constrain Assistant's framework answers to what the platform actually supports — preserve that intent, drop the Haystack token.

- [ ] **Step 3: Update `docs/api-reference/openapi.json`**

In `docs/api-reference/openapi.json`, the `AgentFramework` enum block (around line 3771) reads:

```json
      "AgentFramework": {
        "type": "string",
        "enum": [
          "LANGGRAPH",
          "ADK",
          "CREWAI",
          "HAYSTACK",
          "CUSTOM",
          "TRANSLATION_AGENT",
          "CORRECTION_AGENT",
          "DEEP_RESEARCH_AGENT"
        ],
```

Delete the `"HAYSTACK",` line. The block becomes:

```json
      "AgentFramework": {
        "type": "string",
        "enum": [
          "LANGGRAPH",
          "ADK",
          "CREWAI",
          "CUSTOM",
          "TRANSLATION_AGENT",
          "CORRECTION_AGENT",
          "DEEP_RESEARCH_AGENT"
        ],
```

(Note: this `openapi.json` is a stale snapshot of the deprecated manager API and is not auto-regenerated. We are doing a surgical edit only — broader regeneration is out of scope.)

- [ ] **Step 4: Validate the openapi.json is still well-formed JSON**

```bash
python -c "import json; json.load(open('docs/api-reference/openapi.json'))"
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md docs/.mintlify/Assistant.md docs/api-reference/openapi.json
git status --short
git commit -m "$(cat <<'EOF'
chore(docs): remove Haystack mentions from roadmap and reference docs

Drops Haystack from ROADMAP.md, the Mintlify Assistant guide's
framework list, and the AgentFramework enum in the snapshot
docs/api-reference/openapi.json.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification

**Goal:** Prove the demolition is complete and the test suites are still green end-to-end.

**Files:** none (read-only)

- [ ] **Step 1: Final reference grep**

```bash
rg -i 'haystack' -- libs services docs ROADMAP.md CLAUDE.md \
   --glob '!**/uv.lock' --glob '!old-docs/**' --glob '!**/node_modules/**' --glob '!**/.venv/**'
```

Expected: matches only in `libs/idun_agent_engine/CHANGELOG.md` (the new `### Removed` entry). Anything else is a regression — fix in the relevant task before continuing.

- [ ] **Step 2: Confirm the lock file is Haystack-free**

```bash
rg 'haystack' libs/idun_agent_engine/uv.lock
```

Expected: no matches.

- [ ] **Step 3: Run lint, mypy, schema, engine, standalone tests in sequence**

```bash
make lint
make mypy
uv run pytest libs/idun_agent_schema/tests/ -q
uv run pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
uv run pytest libs/idun_agent_standalone/tests/ -q
```

Expected: all green.

- [ ] **Step 4: Run the UI typecheck once more**

```bash
cd services/idun_agent_standalone_ui && pnpm typecheck && cd ../..
```

Expected: clean.

- [ ] **Step 5: Inspect the resulting commit history**

```bash
git log --oneline origin/develop..HEAD
```

Expected: 7 commits (Task 1 through Task 7) on top of the spec commit. Confirm the order makes sense for review.

- [ ] **Step 6: (No commit in this task — Task 8 is verification only.)**

If everything is green, the branch is ready to push and open a PR against `develop`.

```bash
# Reminder: do not push or open a PR without explicit user approval.
echo "Verification complete. Awaiting user instruction to push / open PR."
```

---

## What could break (recap from spec)

- A YAML config with `agent.type: haystack` fails Pydantic validation at `EngineConfig` load time with a discriminator error. Expected.
- A standalone install whose seeded DB row has `agent.type == "HAYSTACK"` fails on the next reload via `services/engine_config.assemble_engine_config` for the same reason. The reload is rejected, the existing engine keeps running, and `runtime_state` records the failure. Expected.
- No DB-level constraint changes; no Alembic migration is needed.
