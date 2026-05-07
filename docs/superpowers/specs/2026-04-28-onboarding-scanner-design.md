# Onboarding scanner — design

Date: 2026-04-28

Status: Locked through brainstorming. Implementation plan to follow via `writing-plans`.

Parent product spec: [`2026-04-27-idun-onboarding-ux-design.md`](./2026-04-27-idun-onboarding-ux-design.md). This document narrows scope to **sub-project A: the filesystem scanner** that the onboarding wizard consumes through an admin REST endpoint.

## Scope

The scanner is a pure-Python library that walks a folder, detects supported agents (LangGraph and Google ADK), and returns a structured result. It owns no IO beyond filesystem reads and never mutates the filesystem.

In scope:
- Detect LangGraph agents from `.py` source, from `langgraph.json`, and from an Idun `config.yaml`.
- Detect Google ADK agents from `.py` source and from an Idun `config.yaml`.
- Infer a human-friendly agent name.
- Surface enough state for the API layer to classify the folder into the spec's five wizard states.

Out of scope:
- HTTP / API surface (sub-project B).
- Wizard UI (sub-project C).
- Detection of other frameworks (Haystack, CrewAI, Custom). The product spec locks LangGraph and ADK only.
- Notebooks (`.ipynb`). Not parsed.
- Auto-conversion of arbitrary code into agents (explicit non-goal in the parent spec).

## Module location and public API

Lives in `libs/idun_agent_standalone/src/idun_agent_standalone/services/scanner.py`.

Public surface:

```python
async def scan_folder(root: Path) -> ScanResult: ...
```

`scan_folder` is async because the parent spec wraps it in a 5-second `asyncio.wait_for` budget at the API layer; the function itself does not need true async IO, but the signature keeps the call site idiomatic.

The result types live in `idun_agent_schema.standalone.onboarding` so both backend and UI consumers share the same shape:

```python
class DetectedAgent(_CamelModel):
    framework: Literal["LANGGRAPH", "ADK"]
    file_path: str           # POSIX-style relative path from scan root
    variable_name: str       # top-level binding inside file_path
    inferred_name: str
    confidence: Literal["HIGH", "MEDIUM"]
    source: Literal["config", "source", "langgraph_json"]


class ScanResult(_CamelModel):
    root: str                # absolute path of the scanned folder
    detected: list[DetectedAgent]
    has_python_files: bool   # at least one .py file under the walk
    has_idun_config: bool    # at least one config.yaml with valid agent.type
    scan_duration_ms: int
```

The five-state classification (EMPTY / NO_SUPPORTED / ONE_DETECTED / MANY_DETECTED / ALREADY_CONFIGURED) is **not** computed by the scanner. The API layer in sub-project B combines `ScanResult` with the standalone DB state (does an agent row already exist?) to derive the wizard state. This split keeps the scanner stateless and reusable from CLIs or tests.

## Walk strategy

`os.walk(root)` with a fixed skip list — no `.gitignore` parsing, no extra dependency.

Skipped directory names (matched by basename):

```
.git, __pycache__, node_modules, .venv, venv, env, dist, build, target
```

Plus any directory whose basename starts with `.`.

Depth limit: 4. The walk truncates at `len(rel_parts) > 4` to keep monorepo scans bounded.

File filters:
- Only `.py` files are parsed. `.ipynb` notebooks are ignored entirely.
- Files larger than 1 MB are skipped (binary-ish, unlikely to be agent source).

## Detection sources

The scanner runs three detection paths and unions their results. A single file may surface in multiple paths (e.g. listed in `langgraph.json` and also imported as source); the scanner deduplicates on `(file_path, variable_name)` and keeps the entry with the highest confidence.

### Path 1 — Idun `config.yaml`

For each `config.yaml` / `config.yml` at depth 0–2 under the scan root:

1. Parse with PyYAML inside a try/except. Any parse error: skip the file silently.
2. Read `agent.type`. If the value is `"LANGGRAPH"` or `"ADK"`, continue. Other values are ignored.
3. Read `agent.config.graph_definition` (LangGraph) or `agent.config.agent` (ADK). If absent or not in `path:variable` shape, skip.
4. Emit a `DetectedAgent` with `confidence="HIGH"` and `source="config"`.
5. Set `has_idun_config = True` on the overall result.

### Path 2 — `langgraph.json`

Only at depth 0 (scan root). The `langgraph.json` is a top-level project config, not a per-agent file.

1. Parse with `json.load` inside a try/except.
2. Read the `graphs` object. For each entry `key: value`:
   - `value` must be in `path:variable` shape.
   - Emit a `DetectedAgent` with `framework="LANGGRAPH"`, `confidence="HIGH"`, `source="langgraph_json"`.
   - Use `key` as the `inferred_name` candidate at priority 2 in the inference cascade (see below).
3. `has_idun_config` is **not** set by this path. `langgraph.json` is not an Idun config.

### Path 3 — `.py` source

For each `.py` file under the walk:

1. **Regex pre-filter** on the file's text. Cheap reject if none of these patterns match:
   - LangGraph: `(?m)^\s*(from\s+langgraph[\s.]|import\s+langgraph)`
   - ADK: `(?m)^\s*(from\s+google\.adk|import\s+google\.adk)`
2. If the regex matches, set `has_python_files = True` and continue. (`has_python_files` is also set by walking any `.py` file, regardless of imports — see below.)
3. `ast.parse()` the file inside a try/except. SyntaxError or any parse failure: skip the file.
4. Walk the module-level body. For each `Assign` or `AnnAssign` node where the LHS is a single `Name`:
   - LangGraph match: RHS is a `Call` whose callable resolves (lexically) to `StateGraph(...)` or `<expr>.compile(...)` where the receiver is a `StateGraph` instance lexically traceable in the same file.
   - ADK match: RHS is a `Call` whose callable name is one of `Agent`, `LlmAgent`, `SequentialAgent`, `ParallelAgent`, `LoopAgent` (the public ADK agent classes).
5. Emit `DetectedAgent` with the framework, `confidence="MEDIUM"`, `source="source"`, `variable_name = LHS name`.

The "lexically traceable" rule for `compile()` is best-effort: if `graph.compile()` is the assignment and `graph = StateGraph(...)` exists at module level above it, treat as a LangGraph agent. If we cannot trace the receiver, skip — better to miss a detection than to false-positive a generic `something.compile()` call.

When both an intermediate `StateGraph(...)` binding and a downstream `.compile()` binding exist in the same file (e.g. `g = StateGraph(...)` then `graph = g.compile()`), the scanner emits **one** detection only, picking the compiled binding (`graph`) as `variable_name`. The compiled form is what `idun_agent_engine` ultimately runs, so the wizard pre-fills the right `graph_definition`.

`has_python_files` separately: the walk sets this `True` for **any** `.py` file encountered, regardless of imports. This drives the spec's state-1 vs state-4 distinction (empty folder vs code-but-no-supported-agent).

## Name inference cascade

For each `DetectedAgent`, `inferred_name` is computed by the first matching rule:

1. `source == "config"` and the YAML has `agent.config.name` → use it verbatim.
2. `source == "langgraph_json"` → use the dict key (the graph name).
3. `pyproject.toml` at scan root has `[project].name` → title-case it (`my-agent` → "My Agent", `my_agent` → "My Agent").
4. The parent directory of `file_path` (skipping `src/` if present) → title-case it.
5. The filename without extension, stripped of trailing `_agent` or leading `agent` → title-case.
6. Fallback: `"My Agent"`.

Rules 3–5 reuse the standalone `services.slugs.normalize_slug` lowercase + ASCII fold logic in reverse: the inferred name is humanized, the wizard later normalizes it back to a slug when writing the row.

## Performance and safety

- Total scan budget: 5 seconds, enforced by the **caller** via `asyncio.wait_for`. The scanner does not enforce this internally — it returns whatever it has when interrupted.
- AST parse failures are non-fatal. The scanner logs at DEBUG level and continues. The spec's error surface is "fewer detections than possible", never an exception.
- YAML and JSON parse failures are non-fatal in the same way.
- `scan_duration_ms` is always populated, even on partial walks.
- The scanner does not follow symlinks (`os.walk` default).

## Testing

Test file: `libs/idun_agent_standalone/tests/unit/services/test_scanner.py`.

Each test uses `pytest`'s `tmp_path` fixture to materialize a fake folder.

Required test cases:

| Case | Expected |
|---|---|
| Empty folder | `detected=[]`, `has_python_files=False`, `has_idun_config=False` |
| Folder with one `dummy.py` containing a string only | `detected=[]`, `has_python_files=True` |
| Minimal LangGraph: `agent.py` with `from langgraph.graph import StateGraph` + `graph = StateGraph(...).compile()` | 1 detection, `framework=LANGGRAPH`, `confidence=MEDIUM`, `source=source`, `variable_name=graph` |
| Minimal ADK: `agent.py` with `from google.adk.agents import Agent` + `root_agent = Agent(...)` | 1 detection, `framework=ADK`, `confidence=MEDIUM` |
| LangGraph but uncompiled: `graph = StateGraph(...)` direct | Detected (StateGraph constructor counts) |
| LangGraph with intermediate var: `g = StateGraph(...); graph = g.compile()` | Detected, `variable_name=graph` (the compiled binding wins) |
| Generic `something.compile()` with no traceable StateGraph receiver | Not detected (no false positive) |
| ADK with `LlmAgent` instead of `Agent` | Detected |
| `config.yaml` with valid LangGraph block | 1 detection, `confidence=HIGH`, `source=config`, `has_idun_config=True` |
| `config.yaml` referencing the same file as `agent.py` source detection | 1 detection (HIGH confidence wins, dedup on `(file_path, variable_name)`) |
| `langgraph.json` with two entries in `graphs` | 2 detections, both HIGH, both `source=langgraph_json` |
| `langgraph.json` malformed JSON | Skip silently, no crash |
| `config.yaml` malformed YAML | Skip silently |
| `.py` file with `SyntaxError` | Skip silently, scan continues |
| Directory tree with `.venv/` containing a fake graph | `.venv/` skipped, no detection from inside it |
| Depth-5 nested file with a graph | Not detected (depth limit) |
| `pyproject.toml` `[project].name = "my-bot"` + a graph in `agent.py:graph` | `inferred_name = "My Bot"` |
| Same setup but no pyproject, parent dir is `chat_assistant/` | `inferred_name = "Chat Assistant"` |
| Same setup but file is `chatbot_agent.py` | `inferred_name = "Chatbot"` (strip `_agent`) |
| `langgraph.json` with `"graphs": {"helpdesk": "./agent.py:graph"}` | `inferred_name = "helpdesk"` (verbatim) |
| `.ipynb` file with a graph definition | Ignored entirely |
| 2 MB `.py` file with a graph | Skipped (size limit) |

The scanner is pure Python — no fixture needs network, DB, or asyncio plumbing. Tests run in <1s in aggregate.

## Implementation notes for the planner

- Add `pyyaml` is already a dep of `idun-agent-standalone`. No new dep for YAML.
- `tomllib` (stdlib in 3.12) for `pyproject.toml`. No new dep.
- The regex pre-filter avoids parsing every `.py` in a repo as AST. For a repo of 5000 files where 5 import langgraph, the pre-filter rejects 4995 in microseconds.
- The schema additions live in `idun_agent_schema/standalone/onboarding.py` with corresponding exports from `idun_agent_schema/standalone/__init__.py`.

## Non-goals (recap)

- No `.gitignore` parsing.
- No detection of frameworks beyond LangGraph and ADK.
- No parsing of `.ipynb`.
- No auto-conversion of code.
- No filesystem mutation.
- No HTTP, no DB, no global state.
- No five-state classification — that lives in sub-project B.
