# Onboarding HTTP API Design

> **Sub-project:** B (of A–E from `2026-04-27-idun-onboarding-ux-design.md`)
> **Status:** Locked — ready for implementation plan
> **Depends on:** Sub-project A (`2026-04-28-onboarding-scanner-design.md`, PR #538)
> **Branch:** `feat/onboarding-scanner` (extending the same branch — no rebase, additive only)

---

## 1. Goal

Build the HTTP layer that the onboarding wizard talks to. Three endpoints under `/admin/api/v1/onboarding/` that:

1. Scan the user's project and classify it into one of 5 onboarding states.
2. Materialize an agent from a detection picked by the user.
3. Scaffold a fresh starter project (multi-file) when no detection is usable.

The wizard UI is not in this spec (sub-project C). The `idun init` CLI is not in this spec (sub-project D), but the scaffolder is built here as a shared service that D will reuse.

## 2. Why

The standalone runtime today boots with no agent if the user hasn't placed a `config.yaml`. `GET /agent` returns 404, the chat UI has nothing to render, and the user is stuck. Sub-project A built a scanner that finds existing LangGraph/ADK agents and infers their wiring — this sub-project turns that scanner output into a wizard-driven flow that can either adopt an existing agent or scaffold a new one, all without leaving the browser.

## 3. Out of scope

- Wizard UI (Next.js pages, mockups, copy) — sub-project C
- `idun init` CLI command — sub-project D (reuses the scaffolder built here)
- Driver.js guided tour — sub-project E
- `DELETE /agent` endpoint (called out as a future need; not implemented here)
- Writing `config.yaml` to disk from materialize endpoints (DB is canonical)
- Switching agents post-configuration (handled later via DELETE + re-wizard)
- Trial-import / pre-flight validation of user code (we let reload do the validation)

## 4. State machine

The wizard's UI logic switches on a 5-state classification computed server-side. States are derived from `(scanner_output, agent_row_exists)`:

| State | Condition | UI behavior |
|---|---|---|
| `EMPTY` | `not has_python_files` and `not has_idun_config` | Show "Start fresh" button → `create-starter` |
| `NO_SUPPORTED` | `has_python_files` but `len(detected) == 0` | Show "We didn't find an agent — start fresh" → `create-starter` |
| `ONE_DETECTED` | `len(detected) == 1` | Auto-suggest the one detection → `create-from-detection` |
| `MANY_DETECTED` | `len(detected) >= 2` | List detections, let user pick → `create-from-detection` |
| `ALREADY_CONFIGURED` | `StandaloneAgentRow` exists | UI never mounts the wizard — goes straight to chat |

`ALREADY_CONFIGURED` is reachable from `/scan` only as a defensive case (race / direct curl). The UI side detects this earlier via `GET /agent` returning 200.

### Why classification on the server

- One round trip for the wizard (scan + state + current agent in a single payload)
- One source of truth for state — server-side validation in materialize endpoints uses the same logic
- Avoids leaking state-machine logic into TypeScript

## 5. Endpoint contracts

All endpoints sit under `/admin/api/v1/onboarding/`. All require auth via the existing `Depends(require_auth)` dependency (PR #537 strict-minimum auth).

### 5.1 `POST /admin/api/v1/onboarding/scan`

**Body:** none. **Response:** `ScanResponse`.

Flow:
1. Read `StandaloneAgentRow` (singleton — at most one row, app-level invariant; see §10).
2. If row exists → return `{ state: "ALREADY_CONFIGURED", scanResult: <empty>, currentAgent: <row> }`. Skip scanner invocation.
3. Otherwise call `scanner.scan_folder(Path.cwd())`.
4. Classify per the table in §4.
5. Return `{ state, scanResult, currentAgent: null }`.

**Why `Path.cwd()`:** The user runs `idun standalone` from their project root. Using CWD decouples scan root from `settings.config_path` (which may live in `./idun-config/config.yaml` while the agent code is at `./`). Per Q1 in the brainstorm.

### 5.2 `POST /admin/api/v1/onboarding/create-from-detection`

**Body:** `CreateFromDetectionBody`. **Response:** `MutationResponse[AgentRead]`.

Flow:
1. **Pre-check:** if `StandaloneAgentRow` exists → `409 agent_already_configured`.
2. Re-scan: `scanner.scan_folder(Path.cwd())`.
3. Find the detection where `(framework, file_path, variable_name)` matches the body exactly.
4. **If no match → `409 detection_not_found`** with `{ filePath, variableName }` echoed back. (TOCTOU: file changed between scan and click.)
5. Build `EngineConfig` from the **server's** `DetectedAgent` (not the body):
   - LangGraph: `agent.type = "LANGGRAPH"`, `agent.config.graph_definition = "{file_path}:{variable_name}"`, `agent.config.name = inferred_name`
   - ADK: `agent.type = "ADK"`, `agent.config.agent = "{file_path}:{variable_name}"`, `agent.config.name = inferred_name`
   - `memory`: omitted (engine default in-memory checkpoint)
   - `observability`: omitted
6. Insert `StandaloneAgentRow(name=detection.inferred_name, base_engine_config=...)` (id defaults to a fresh UUID; see §10).
7. Trigger reload via existing `reload_orchestrator`.
8. Return `MutationResponse { data: AgentRead, reload: { status, ... } }`.

**Why re-scan:** Q4 in the brainstorm. Scan is cheap (sub-100ms typical), and re-scanning gives free TOCTOU protection, prevents client tampering with `inferred_name`/`file_path`, and keeps the body small + stable.

**Reload failure:** Row stays. UI shows the diagnostic; user fixes their code and PATCH /agent retries reload.

### 5.3 `POST /admin/api/v1/onboarding/create-starter`

**Body:** `CreateStarterBody`. **Response:** `MutationResponse[AgentRead]`.

Flow:
1. **Pre-check:** if `StandaloneAgentRow` exists → `409 agent_already_configured` (zero files written).
2. Call `scaffold.create_starter_project(root=Path.cwd(), framework=body.framework)`. Scaffolder atomically writes 5 files (`agent.py`, `requirements.txt`, `.env.example`, `README.md`, `.gitignore`) or raises `ScaffoldConflictError` (zero files written). Router translates the exception to `409 scaffold_conflict` with `{ paths: [...] }`.
3. Build `EngineConfig`:
   - LangGraph: `agent.config.graph_definition = "agent.py:graph"`, `agent.config.name` = sanitized form of `body.name` or `"starter"`
   - ADK: `agent.config.agent = "agent.py:agent"`, `agent.config.name` = sanitized form of `body.name` or `"starter"`
4. Insert row with `name = body.name or "Starter Agent"`.
5. Trigger reload.
6. Return envelope.

**Reload failure:** Files + row both stay. User edits `agent.py`, PATCH /agent retries.

## 6. Schema additions

File: `libs/idun_agent_schema/src/idun_agent_schema/standalone/onboarding.py` (already exists from sub-project A).

Add:

```python
from typing import Literal
from pydantic import Field
from idun_agent_schema._base import _CamelModel
from idun_agent_schema.standalone.agent import AgentRead

OnboardingState = Literal[
    "EMPTY",
    "NO_SUPPORTED",
    "ONE_DETECTED",
    "MANY_DETECTED",
    "ALREADY_CONFIGURED",
]

class ScanResponse(_CamelModel):
    state: OnboardingState
    scan_result: ScanResult            # already defined in this module
    current_agent: AgentRead | None = None

class CreateFromDetectionBody(_CamelModel):
    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str
    variable_name: str

class CreateStarterBody(_CamelModel):
    framework: Literal["LANGGRAPH", "ADK"]
    name: str | None = Field(default=None, min_length=1, max_length=80)
```

Existing exports kept: `DetectedAgent`, `ScanResult`. The materialize endpoints reuse the existing `MutationResponse` envelope from `idun_agent_schema.standalone.common`.

## 7. Module layout

```
libs/idun_agent_standalone/src/idun_agent_standalone/
├── services/
│   ├── scanner.py              ← exists (PR #538)
│   ├── scaffold.py             ← NEW
│   └── onboarding.py           ← NEW
├── api/v1/routers/
│   └── onboarding.py           ← NEW
└── api/v1/deps.py              ← exists (require_auth, reload_disabled)
```

Wiring: `app.py` adds `app.include_router(onboarding_router, dependencies=[Depends(require_auth)])`.

### Why the split

- `scaffold.py` is a pure side-effect module (template strings + atomic file writes). No DB, no FastAPI, no SQLAlchemy. Sub-project D's CLI imports it directly.
- `onboarding.py` (service) owns the parts that touch DB + reload: state classification, building `EngineConfig` from a detection, calling `reload_orchestrator`. Stays out of the scaffolder so the scaffolder can be unit-tested without an event loop.
- `routers/onboarding.py` is thin — body validation, dependency injection, calls services.

## 8. Scaffolder (`services/scaffold.py`)

### Public API

```python
class ScaffoldConflictError(Exception):
    """Raised when target files already exist."""
    def __init__(self, paths: list[Path]) -> None:
        self.paths = paths
        super().__init__(f"Scaffold conflict: {[str(p) for p in paths]}")

def create_starter_project(
    root: Path,
    framework: Literal["LANGGRAPH", "ADK"],
) -> list[Path]:
    """Atomically write 5 starter files. Returns paths in write order."""
```

### File set (per framework)

Both frameworks emit 5 files:

| Path | LangGraph content | ADK content |
|---|---|---|
| `agent.py` | Hello-world `StateGraph` | Hello-world `Agent(...)` |
| `requirements.txt` | `idun-agent-standalone`, `langgraph>=0.2.0`, `langchain-core>=0.3.0`, `langchain-openai>=0.2.0` | `idun-agent-standalone`, `google-adk>=0.1.0` |
| `.env.example` | `OPENAI_API_KEY=` | `GOOGLE_API_KEY=` |
| `README.md` | Identical 4-step quick-start (copy `.env.example`, install, run, edit) | Identical |
| `.gitignore` | Identical: `.env`, `__pycache__/`, `*.pyc`, `.venv/`, `.idun/` | Identical |

Templates are stored as module-level `Final[str]` constants — not as files in a `templates/` directory. Keeps the package self-contained and avoids `importlib.resources` ceremony.

### Atomic write algorithm

```python
def create_starter_project(root, framework):
    files = _build_file_map(root, framework)   # dict[Path, str]: 5 entries

    conflicts = [p for p in files if p.exists()]
    if conflicts:
        raise ScaffoldConflictError(conflicts)

    written: list[Path] = []
    try:
        for path, content in files.items():
            tmp = path.with_suffix(path.suffix + ".idun-tmp")
            tmp.write_text(content)
            tmp.rename(path)              # atomic on POSIX
            written.append(path)
    except Exception:
        for p in written:
            p.unlink(missing_ok=True)
        raise

    return written
```

The conflict pre-check is the only thing that prevents partial writes in the happy path. The cleanup loop handles mid-write disk failures (full disk, permissions). Atomicity guarantee: if the function raises, the directory state is unchanged.

### Generated `agent.py` shape (LangGraph)

```python
"""Minimal LangGraph hello-world agent."""
from langgraph.graph import StateGraph, END
from typing import TypedDict

class State(TypedDict):
    message: str

def echo(state: State) -> State:
    return {"message": f"You said: {state['message']}"}

graph = StateGraph(State)
graph.add_node("echo", echo)
graph.set_entry_point("echo")
graph.add_edge("echo", END)
graph = graph.compile()
```

### Generated `agent.py` shape (ADK)

```python
"""Minimal Google ADK hello-world agent."""
from google.adk.agents import Agent

agent = Agent(
    name="starter",
    model="gemini-2.0-flash",
    description="A minimal starter agent.",
    instruction="You are a helpful assistant. Respond concisely.",
)
```

Both files import the variable that the scanner will detect on next run (`graph` for LangGraph, `agent` for ADK), so a re-scan after starter creation would correctly classify the project as `ALREADY_CONFIGURED` (because the row exists by then) and otherwise `ONE_DETECTED`.

## 9. Onboarding service (`services/onboarding.py`)

### Public surface

```python
async def get_scan_response(
    session: AsyncSession,
    settings: StandaloneSettings,
) -> ScanResponse: ...

async def materialize_from_detection(
    session: AsyncSession,
    body: CreateFromDetectionBody,
    settings: StandaloneSettings,
    reload_orchestrator: ReloadOrchestrator,
) -> MutationResponse[AgentRead]: ...

async def materialize_starter(
    session: AsyncSession,
    body: CreateStarterBody,
    settings: StandaloneSettings,
    reload_orchestrator: ReloadOrchestrator,
) -> MutationResponse[AgentRead]: ...
```

### Errors

Service-layer exceptions (router translates to HTTP):

```python
class AgentAlreadyConfiguredError(Exception): ...
class DetectionNotFoundError(Exception):
    def __init__(self, file_path: str, variable_name: str) -> None: ...
```

Plus `ScaffoldConflictError` from `scaffold.py`.

Router translation table:

| Exception | HTTP | Body |
|---|---|---|
| `AgentAlreadyConfiguredError` | 409 | `{ "error": "agent_already_configured" }` |
| `DetectionNotFoundError` | 409 | `{ "error": "detection_not_found", "filePath": ..., "variableName": ... }` |
| `ScaffoldConflictError` | 409 | `{ "error": "scaffold_conflict", "paths": [...] }` |

### State classification helper

```python
def classify_state(scan_result: ScanResult, agent_row_exists: bool) -> OnboardingState:
    if agent_row_exists:
        return "ALREADY_CONFIGURED"
    if not scan_result.has_python_files:
        return "EMPTY"
    if not scan_result.detected:
        return "NO_SUPPORTED"
    if len(scan_result.detected) == 1:
        return "ONE_DETECTED"
    return "MANY_DETECTED"
```

`has_idun_config` from `ScanResult` is **not** a classification input — it's surfaced in the response for the UI to optionally show "we found a config.yaml" but doesn't change the state. (The `seed.py` boot path already handles config.yaml; if it had successfully seeded, an agent row would exist and state would be `ALREADY_CONFIGURED`. So `has_idun_config=true` + `agent_row_exists=false` only happens if the yaml is malformed — that's a different error class, surfaced via boot-time logs, not the wizard.)

## 10. Concurrency + idempotency

`StandaloneAgentRow` is a singleton **by app-level invariant**, not a DB constraint. The row uses a UUID primary key (`String(36)`, default `_new_uuid`) — the same shape as every other admin row in the schema — so the database does not, on its own, prevent two rows from existing. The "first-agent-only" semantic is enforced by the materialize coroutines.

Two-stage check in each materialize coroutine (`materialize_from_detection`, `materialize_starter`):

1. **Outer pre-check** (cheap, before scan / scaffold): if a row already exists, raise `409 agent_already_configured` immediately. Avoids running the scanner or writing 5 files for a doomed request.
2. **Inner re-check** (correctness, inside `services.reload._reload_mutex`): repeat the row lookup just before `session.add(row)`. The mutex is a process-wide `asyncio.Lock` that already serializes admin mutations through `commit_with_reload`; the re-check closes the TOCTOU window between the outer check and the insert.

Concurrency posture per endpoint:

- `/scan` is read-only — safe to call concurrently. Reads the agent row, runs the scanner (no DB write), classifies state. No mutex.
- `/create-from-detection` and `/create-starter` serialize through `_reload_mutex`. Two concurrent calls: one wins, the other gets `409 agent_already_configured` from the inner re-check.
- `/create-starter` scaffolder runs **before** the mutex (so disk IO doesn't span the lock). Two concurrent calls may both pass the outer pre-check and both write 5 files; the loser's files persist on disk because rolling back disk state from inside a mutex re-check is gnarly. Recovery: operator can move/delete the loser's files and re-run the wizard, or use `PATCH /agent` to redirect the existing agent at the new files. Acceptable for MVP given uvicorn's default single-process posture for standalone.

**Why no DB constraint:** adding `id = "singleton"` as a fixed PK would diverge `StandaloneAgentRow` from every sibling resource (memory, observability, mcp_servers, etc., all UUID-keyed). The mutex pattern is shared with the rest of the admin surface, and the singleton invariant is enforced at exactly the layer that owns the lifecycle (the materialize coroutines), so the DB layer doesn't need to know anything about it.

## 11. Auth + reload

- All three endpoints carry `Depends(require_auth)` from `api/v1/deps.py`. Same gate as every other admin route.
- `reload_orchestrator` is the existing dependency injected via `Depends(get_reload_orchestrator)`. Materialize endpoints call `await reload_orchestrator.reload()` and pass the returned `ReloadStatus` into the `MutationResponse` envelope.

## 12. Testing strategy

### Unit tests

`tests/unit/services/test_scaffold.py` (~12 tests)
- Writes 5 expected files (LangGraph)
- Writes 5 expected files (ADK)
- Returned paths are in deterministic write order
- Raises `ScaffoldConflictError` listing all conflicting paths
- Atomicity: zero files written on conflict
- Cleanup: simulated `OSError` mid-write removes already-written files
- Generated `agent.py` parses with `ast.parse` (LangGraph + ADK)
- Generated `requirements.txt` has no garbage lines
- `.env.example` contains the framework-appropriate API key variable
- `.gitignore` covers `.env`

`tests/unit/services/test_onboarding.py` (~10 tests)
- `classify_state` returns each of the 5 states for the right inputs (5 tests)
- `build_engine_config_from_detection` produces correct LangGraph config
- `build_engine_config_from_detection` produces correct ADK config
- Singleton row check raises `AgentAlreadyConfiguredError` before scan in `materialize_from_detection`
- Singleton row check raises `AgentAlreadyConfiguredError` before scan in `materialize_starter`

### Integration tests

`tests/integration/api/v1/test_onboarding_flow.py` (~14 tests)

`/scan` (5 tests):
- EMPTY: empty tmp_path → state EMPTY
- NO_SUPPORTED: tmp_path with non-agent .py file → state NO_SUPPORTED
- ONE_DETECTED: tmp_path with one LangGraph agent → state ONE_DETECTED
- MANY_DETECTED: tmp_path with two agents → state MANY_DETECTED
- ALREADY_CONFIGURED: agent row pre-seeded → state + currentAgent populated

`/create-from-detection` (4 tests):
- Happy LangGraph: detect → materialize → reload triggered → 200 + envelope
- Happy ADK: same
- Stale detection: file deleted between scan and call → 409 detection_not_found
- Already configured → 409 agent_already_configured

`/create-starter` (5 tests):
- Happy LangGraph: 5 files written, row created, reload status returned
- Happy ADK: same
- Conflict (e.g., `agent.py` already exists) → 409 scaffold_conflict, zero files written
- Already configured → 409 agent_already_configured, zero files written
- Reload failure surfaces in envelope (mock reload to fail), row + files persist

### Test infrastructure

- Async session fixture: existing pattern from `test_observability_flow.py`
- `monkeypatch.chdir(tmp_path)` per test to isolate scan root
- `tmp_path` fixtures for scaffolding tests — never touch the repo

### What we're NOT testing here

- Scanner internals (PR #538 — 39 tests)
- Reload orchestrator (Wagon 1's tests)
- Auth gate (PR #537's tests)
- Pydantic body validation (FastAPI's job)

## 13. Future work (deferred — not in this sub-project)

- `DELETE /admin/api/v1/agent` — explicit "clear agent" path so the user can re-run the wizard without manual DB editing. Required if we want to support agent switching.
- `idun init` CLI (sub-project D) — wraps `scaffold.create_starter_project` in a typer/click command, also writes a `config.yaml` (CLI is YAML-based, runtime is DB-based — they meet at first boot).
- Wizard UI (sub-project C) — Next.js pages that consume these endpoints.
- Driver.js guided tour (sub-project E) — post-wizard hand-off.

## 14. Open questions

None at time of locking. All architectural decisions pinned via the brainstorm Q1–Q11.
