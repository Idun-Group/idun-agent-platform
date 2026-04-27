# Phase 1 — Foundation Audit & Patterns Doc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the agent + memory rework slices on `feat/standalone-admin-db-rework` against the locked rework spec, fix every pattern-breaker, and produce the canonical patterns reference doc that Phases 2–7 will follow.

**Architecture:** Sequential — read-only Explore subagent produces an audit findings report → triage on main thread → per-finding fix commits (single-file edits on main thread, multi-file edits via fix subagents) → patterns doc on main thread → CI gate → PR into the umbrella branch.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Pydantic 2.11+. No new dependencies. Existing tooling: `uv`, `make`, `pytest`, `ruff`, `mypy`, `gh`.

**Spec:** `docs/superpowers/specs/2026-04-27-rework-phase1-audit-and-patterns-design.md`
**Authoritative source for rules audited:** `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md`

**Working branch:** `feat/rework-phase1-audit-and-patterns` (already created from `feat/standalone-admin-db-rework`).
**PR target:** `feat/standalone-admin-db-rework` (the umbrella branch).

**Commit sequence (target):**
1. `c7dc9637 docs(rework-phase1): add Phase 1 design doc` — already landed (pre-plan).
2. `docs(rework-phase1): audit findings` — Task 1.
3. `fix(rework-phase1): <pattern-breaker title>` × N — Task 3 loop.
4. `docs(rework-phase1): patterns reference` — Task 4.

---

## Task 0: Pre-flight checks

**Files:** none (verification only)

- [ ] **Step 1: Verify the working branch**

Run:
```bash
git status -sb
```
Expected: first line is `## feat/rework-phase1-audit-and-patterns`. If not, switch with `git checkout feat/rework-phase1-audit-and-patterns`.

- [ ] **Step 2: Verify the design doc commit is the tip**

Run:
```bash
git log --oneline -1
```
Expected: `c7dc9637 docs(rework-phase1): add Phase 1 design doc` (or a later commit only if Task 1+ already started).

- [ ] **Step 3: Verify the rework slice commit range exists**

Run:
```bash
git log --oneline 10018468..fd90d8bb | wc -l
```
Expected output: `12` (twelve commits — schema namespace foundation + new standalone tree + bootstrap seed).

- [ ] **Step 4: Scan the narrowed CI baseline and document known pre-existing failures**

The umbrella branch is in a deliberate mid-rework state. Pre-flight is reframed: lint must be green; mypy and pytest are SCANNED to confirm failures are confined to known classes (legacy-tied tests, pre-existing pattern-breakers in new-tree code that the audit will catch). Task 5 (the post-fix CI gate) is what enforces full green.

Run, sequentially:

```bash
make lint
```
Expected: exit 0. If non-empty output: STOP — lint debt should have been autofixed in `chore(rework-phase1)` commit `d3369bbc` or equivalent.

```bash
uv run mypy \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected at pre-flight: errors confined to new-tree files. These are pre-existing pattern-breakers under §6 class 11 (type safety) — the audit will flag them; Task 3 will fix them. Document the exact error count and file list in your session log so the audit's findings can be cross-checked.

If errors appear in files OUTSIDE the new tree (engine, manager, legacy tree): STOP and escalate; the mypy scope was set wrong.

```bash
uv run pytest libs/idun_agent_schema -q

uv run pytest libs/idun_agent_standalone -q \
  -m "not requires_postgres and not requires_langfuse and not requires_phoenix" \
  --ignore=libs/idun_agent_standalone/tests/unit/test_admin_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_reload.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_scaffold.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_cli.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_app_health.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_integrations_casing.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_structural_change_restart.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_auth_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_atomic.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_engine_reload_reattaches_observer.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_flow.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_bootstrap_hash.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_config_io.py
```
Expected: schema run exits 0; standalone run exits 0 OR has only failures that the audit will catalog as deferred (e.g. legacy-binding imports in test files I missed). If new failures appear, add the test file to the `--ignore` list and re-run; if a new-tree test fails, treat as a pre-existing pattern-breaker for the audit to find.

Notes:

- The pytest `--ignore` list is the set of legacy-tied test files (they import from `app.py`, `config_io.py`, `runtime.py`, `reload.py`, `config_assembly.py`, or legacy `cli.py init` — modules being gutted across the rework). These fail to collect because their imports no longer resolve. Repair or deletion is Phase 8 work.
- The mypy command is scoped to the **new tree only** — `idun_agent_schema/standalone` (not all of schema), and the four new-tree subpackages of standalone. Pre-existing mypy debt elsewhere (`idun_agent_schema/engine`, `idun_agent_schema/manager`, `idun_agent_engine`, legacy standalone) is NOT in scope.
- If failures appear in the new tree, that's the §6 class 11 condition the design doc anticipates: audit catches → Task 3 fixes → Task 5 verifies green.

---

## Task 1: Run the audit subagent and commit the findings doc

**Files:**
- Create: `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md`

This task dispatches a single Explore subagent. The subagent reads files; it does not write code or commit anything. The main thread captures its output and commits it.

- [ ] **Step 1: Dispatch the audit subagent**

Use the Agent tool with the following parameters:

- `subagent_type`: `Explore`
- `description`: `Phase 1 standalone rework audit`
- `prompt`: paste the entire prompt block below verbatim.

```
You are a read-only auditor for the standalone admin/db rework's Phase 1.
Your job is to compare the rework slices already in tree against the locked
rework spec and produce a findings report. You DO NOT propose fixes; you DO
NOT write code. You DO NOT commit anything. You only read and report.

== Inputs ==

Rework spec (the law you audit against):
  docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md

Phase 1 design doc (defines audit scope and the pattern-breaker bar):
  docs/superpowers/specs/2026-04-27-rework-phase1-audit-and-patterns-design.md
  Read §3 (audit scope), §6 (pattern-breaker checklist), and §11 (non-goals).

Commit range to audit: 10018468..fd90d8bb on feat/standalone-admin-db-rework

In-scope file globs (the "new tree"):
  - libs/idun_agent_schema/src/idun_agent_schema/standalone/**.py
  - libs/idun_agent_standalone/src/idun_agent_standalone/api/**.py
  - libs/idun_agent_standalone/src/idun_agent_standalone/core/**.py
  - libs/idun_agent_standalone/src/idun_agent_standalone/services/**.py
  - libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/**.py

Out-of-scope (do NOT audit, do NOT flag drift in these):
  - libs/idun_agent_standalone/src/idun_agent_standalone/admin/**
  - libs/idun_agent_standalone/src/idun_agent_standalone/auth/**
  - libs/idun_agent_standalone/src/idun_agent_standalone/db/**
  - libs/idun_agent_standalone/src/idun_agent_standalone/traces/**
  - libs/idun_agent_standalone/src/idun_agent_standalone/theme/**
  - libs/idun_agent_standalone/src/idun_agent_standalone/{app,cli,reload,config_assembly,config_io,runtime,settings,middleware,errors,runtime_config,scaffold,testing,testing_app}.py

== Method ==

For each in-scope file:
1. Read the file in full.
2. Compare against every applicable rule in the rework spec.
3. For each drift, classify as PATTERN-BREAKER or DEFERRED.
4. Record under stable IDs P1-AF-001, P1-AF-002, ...

Pattern-breaker checklist (these ten classes are the ONLY ones that count
as Phase 1 fixes):

1. Mutation envelope shape — POST/PATCH/DELETE responses use
   StandaloneMutationResponse[T] with `data` and `reload` fields. DELETE
   in particular is wrapped, not bare.
2. Reload status enum + HTTP behavior — StandaloneReloadStatus matches
   spec exactly (reloaded, restart_required, reload_failed). HTTP 200 for
   both reloaded and restart_required; never 202.
3. Error envelope — StandaloneAdminError matches spec (code enum, message,
   details, field_errors). Error code enum includes bad_request and
   rate_limited.
4. Case convention — JSON keys camelCase outbound (Pydantic
   alias_generator=to_camel, populate_by_name=True); enum values
   snake_case; path segments kebab-case.
5. File layout — schemas in idun_agent_schema/standalone/, ORMs in
   idun_agent_standalone/infrastructure/db/models/, routers in
   idun_agent_standalone/api/v1/routers/, services in
   idun_agent_standalone/services/, core helpers in
   idun_agent_standalone/core/.
6. Manager schema mirror rule — ORMs use engine-agnostic types
   (String(36) for UUID, SQLAlchemy JSON for JSONB), match manager column
   names + JSON content shape 1:1 (minus workspace_id and junctions),
   no imports from services/idun_agent_manager/, no `from app.*` imports
   inside idun_agent_standalone/, SQLAlchemy Base not shared with manager.
7. Stored shape rule — DB JSON columns store manager-shape Pydantic dumps
   (ManagedMemoryRead/Patch, ManagerGuardrailConfig, MCPServer, etc.),
   not engine-shape or invented standalone shapes. Where conversion is
   needed at assembly, the manager converter is reused.
8. Singleton route shape — Singleton resources (agent, memory) use
   no-{id} routes (/admin/api/v1/agent, /admin/api/v1/memory). DB row
   PK is fixed (e.g. "singleton" for memory). No slug-based lookup.
9. Schema namespace usage — Routers import their request/response shapes
   from idun_agent_schema.standalone.*, not from inline definitions or
   local stub modules.
10. Forbidden patterns — Cross-cuts the above; no `from app.*` imports,
    no 202 for restart_required, no deep-merge PATCH, no association
    tables, no workspace_id columns, no engine-shape JSON in DB columns.
11. Type safety in new-tree files — Mypy errors in any file under
    idun_agent_schema/standalone/ or idun_agent_standalone/{api,core,
    services,infrastructure}/ are pattern-breakers. They indicate real
    bugs (None-handling on singleton rows would crash cold-start) and
    would copy-paste forward into Phase 5 collection routers.
    Pre-existing mypy errors elsewhere (engine, manager, legacy tree)
    are NOT in this class; they are deferred to their owning area.

Drift OUTSIDE these eleven classes is DEFERRED. Tag each deferred finding
with its target phase (Phase 3, 5, 6, or 7) per the design doc §6.

The _SAVED_RELOAD / _NOOP_RELOAD / _DELETE_RELOAD stub constants in
api/v1/routers/{agent,memory}.py are NOT pattern-breakers; they are
documented Phase 3 transients. Do NOT flag them.

== Output ==

Return a SINGLE markdown document following EXACTLY this template. Do not
deviate. Do not add a preamble. Do not add closing remarks.

# Phase 1 Audit Findings — Standalone Admin/DB Rework

Date: 2026-04-27
Audited: commits 10018468..fd90d8bb on feat/standalone-admin-db-rework
Spec: docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md

## Summary
- N findings total
- M classed as pattern-breakers (must fix in Phase 1)
- (N-M) classed as deferred (will roll into a later phase)

## Findings

### P1-AF-001 — <one-line title> — [pattern-breaker | deferred]
**Spec section:** §"..."
**File(s):** path:line(s)
**Drift:** what the spec requires vs what the code does (concrete, with quoted snippets where useful)
**Impact:** what would happen if this pattern propagates to Phases 2-7
**Defer to:** (only for deferred findings) which phase will absorb this

(repeat per finding, IDs P1-AF-002, P1-AF-003, ...)

## Patterns confirmed correct
- one line per major pattern that matches the spec
```

Expected: subagent returns a markdown report following the template above. The findings list is non-empty (some drift is likely) but bounded (the slices were built carefully).

- [ ] **Step 2: Save the report to disk**

Take the markdown returned by the subagent and write it verbatim to `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md` using the Write tool.

If the report deviates from the template (extra preamble, missing summary, wrong heading levels, etc.), DO NOT save it. Re-dispatch the subagent with a tightened prompt. Save only on a clean template match.

- [ ] **Step 3: Stage and commit the findings doc**

Run:
```bash
git add docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md
git status -sb
```
Expected: one staged file, no other changes.

Then:
```bash
git commit -m "$(cat <<'EOF'
docs(rework-phase1): audit findings

Audit of commits 10018468..fd90d8bb on feat/standalone-admin-db-rework
against the locked rework spec. Findings carry stable IDs (P1-AF-NNN) and
are classed as pattern-breaker (Phase 1 fix) or deferred (later phase).
Per the Phase 1 design doc §6, the pattern-breaker bar covers ten classes:
mutation envelope, reload status + HTTP, error envelope, case convention,
file layout, manager schema mirror, stored shape, singleton route shape,
schema namespace usage, and forbidden patterns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit on `feat/rework-phase1-audit-and-patterns`. Verify with `git log --oneline -1`.

---

## Task 2: Triage findings

**Files:** none (decision-making, output is a scratch markdown not committed to repo)

- [ ] **Step 1: Read every pattern-breaker in the findings doc**

Open `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md` and read each finding tagged `pattern-breaker`. For each one, note:

- Finding ID
- Files involved
- Drift type (which of the ten classes from §6)
- Estimated fix scope (single-file vs multi-file)

- [ ] **Step 2: Group pattern-breakers by execution mode**

Categorize each pattern-breaker as either:

- **Main-thread fix** — touches 1–2 files, change is self-contained, no cross-cutting refactor.
- **Subagent fix** — touches 3+ files, or is a cross-cutting change (envelope shape change that propagates across routers + tests, file move, etc.).

Record the grouping in a scratch markdown file at `~/scratch/phase1-triage.md` (NOT committed):

```markdown
# Phase 1 Triage

## Main-thread fixes
- P1-AF-XXX: <one-line>; files: a.py, b.py
- P1-AF-YYY: <one-line>; files: c.py

## Subagent fixes
- P1-AF-ZZZ: <one-line>; files: d.py, e.py, f.py, g.py
  Required spec excerpt: §"..."
  Required outcome: <one paragraph>
```

- [ ] **Step 3: Sanity-check the budget**

Count pattern-breakers:

- 0 pattern-breakers → skip Task 3 entirely; the existing slices are clean. Jump to Task 4.
- 1 to 10 pattern-breakers → proceed to Task 3.
- More than 10 pattern-breakers → STOP and escalate to the user. The bar in design doc §6 was sized to keep this small. >10 means either the bar is wrong or the audit subagent over-flagged. Do not proceed without user direction.

---

## Task 3: Apply pattern-breaker fixes (loop)

**Files:** depends on findings; restricted to in-scope paths from design doc §3 (the new tree).

This task is a loop. For EACH pattern-breaker P1-AF-NNN, run Steps 1–6 below. Each iteration produces one fix commit. Process pattern-breakers ONE AT A TIME; do NOT batch fixes across findings into a single commit.

- [ ] **Step 1: Pick the next pattern-breaker**

From `~/scratch/phase1-triage.md`, pick the next finding not yet checked off. Process them in the order they appear in the audit doc (P1-AF-001 first, then P1-AF-002, etc.) for predictable progress.

- [ ] **Step 2: Apply the fix (main-thread mode)**

If the finding is in the "Main-thread fixes" group:

Use the Edit tool to make the change. The change must be exactly what the audit finding's "Drift" section calls for, scoped to the listed files only. Do not refactor unrelated code in the same edit; cosmetic improvements are deferred per design doc §6.

- [ ] **Step 3: Apply the fix (subagent mode)**

If the finding is in the "Subagent fixes" group:

Dispatch a fix subagent using the Agent tool with `subagent_type: general-purpose`. The prompt template:

```
You are a focused fixer. Apply ONE pattern-breaker fix from the Phase 1 audit. Touch only the files listed below; make no unrelated changes.

Finding: P1-AF-NNN <title from audit>
Spec section: §"<section>" of docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md
Files to modify (absolute paths):
  - /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/<file1>
  - /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/<file2>
  - ...
Audit drift quote:
<paste the "Drift:" content from the audit finding>

Required outcome:
<one paragraph describing what the post-fix code looks like — types, function signatures, imports, etc.>

Constraints:
- Touch only the files listed. No unrelated refactors.
- If a test breaks, fix the test in the same set of edits — do not create separate test commits.
- Do NOT run git commands. Do NOT commit. Edit files in place.
- Match existing code style (Black 88-char, Ruff conventions, snake_case Python).

When complete, return:
1. A one-line commit message subject (under 72 chars)
2. A two-sentence body explaining the fix
3. The list of files modified
```

The subagent edits files directly. The main thread then verifies the changes by running the tests in Step 4.

- [ ] **Step 4: Run the relevant test scope**

After the fix is applied, run the smallest test scope that covers the changed files:

For schema changes (`libs/idun_agent_schema/src/idun_agent_schema/standalone/`):
```bash
uv run pytest libs/idun_agent_schema -q
```

For standalone changes (any path under `libs/idun_agent_standalone/src/idun_agent_standalone/`):
```bash
uv run pytest libs/idun_agent_standalone -q -m "not requires_postgres and not requires_langfuse and not requires_phoenix"
```

Expected: all tests pass.

If a test fails:
- The fix is wrong — revert (`git checkout -- <files>`) and re-dispatch with a tightened prompt.
- The test was wrong (encoded a wrong pattern itself) — fix the test in the same edit set; do NOT make this a separate commit.

- [ ] **Step 5: Stage and commit**

Stage only the files this fix touched (do not use `git add -A`):

```bash
git add <only the files the fix touched>
git status -sb
```
Expected: only the intended files staged.

Commit with a phase-tagged message that references the finding ID:

```bash
git commit -m "$(cat <<'EOF'
fix(rework-phase1): <one-line subject (under 72 chars)>

Resolves P1-AF-NNN.

<two-sentence body explaining what changed and why it was a pattern-breaker>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit on the working branch. Verify with `git log --oneline -1`.

- [ ] **Step 6: Loop or break**

Mark the finding as fixed in `~/scratch/phase1-triage.md`.

If more pattern-breakers remain → return to Step 1.
If all pattern-breakers are fixed → continue to Task 4.

---

## Task 4: Write the patterns reference doc

**Files:**
- Create: `docs/superpowers/specs/2026-04-27-rework-patterns.md`

Written ON THE MAIN THREAD. The doc has 16 sections per the locked TOC (design doc §8). Target ~600 lines. Each rule carries a status tag: ESTABLISHED (locked by post-fix code in this branch) or FORWARD (locked by spec; the snippet is a skeleton derived from the spec, will be refined when the real code lands in its phase).

- [ ] **Step 1: Lay down the doc skeleton with header and 16 section headers**

Use the Write tool to create `docs/superpowers/specs/2026-04-27-rework-patterns.md` with this initial content:

```markdown
# Standalone Admin/DB Rework — Patterns Reference

Date: 2026-04-27

Authoritative source: `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md` (the rework spec). When this doc and the spec disagree, the spec wins.

Audience: subagents executing Phases 2–7 of the standalone admin/db rework, plus future contributors. This doc is the ergonomic copy-paste form of the spec.

Status tags: each rule carries either **ESTABLISHED** (locked by working code in this branch) or **FORWARD** (locked by spec; reference snippet is the canonical skeleton; will be refined when the real code lands in its phase).

## 1. Purpose, audience, and how to use this doc

## 2. Spec linkage

## 3. File layout

## 4. Schema patterns

## 5. ORM patterns

## 6. Router patterns

### 6.1 Singleton router

### 6.2 Collection router

### 6.3 PATCH semantics

### 6.4 DELETE wrapping

### 6.5 Slug rules

### 6.6 Connection-check sub-routes

## 7. Mutation envelope + reload

## 8. Validation rounds

## 9. Error mapping

## 10. Reload mutex

## 11. Cold-start states

## 12. Config hash

## 13. Test patterns

## 14. Manager schema mirror rule

## 15. Forbidden patterns

## 16. Open issues / known caveats
```

- [ ] **Step 2: Fill §1 (Purpose) and §2 (Spec linkage)**

Use the Edit tool to fill these two sections with concrete content. Required content:

§1 must cover:
- The doc's place in the rework's documentation stack: it sits between the spec (the law) and per-phase plans (the procedure). Subagents read both this doc and the spec; this doc is the "developer ergonomics" projection of the spec.
- How to read each rule entry: rule statement → status tag (ESTABLISHED / FORWARD) → reference snippet (with file path + line numbers for ESTABLISHED, code skeleton for FORWARD) → "why this rule" line.
- What to do on conflicts: spec wins; if a phase's reality drifts from the spec, file an issue and update spec + this doc atomically.

§2 must cover:
- Authoritative source: link to the rework spec.
- Maintenance ownership: each phase's PR updates this doc when it lands a forward pattern (replacing the skeleton with a real snippet, removing the FORWARD tag).
- Cross-doc references: how to reference this doc from per-phase design docs and plans.

- [ ] **Step 3: Fill §3 (File layout) — ESTABLISHED**

Use the Edit tool. Required content:

- Tree excerpt of the post-fix new-tree structure (run `find libs/idun_agent_standalone/src/idun_agent_standalone -type d -not -path '*__pycache__*' | sort` and prune to the in-scope paths).
- Table of file responsibilities: for each in-scope file, one row with columns: path, purpose, "must NOT contain".
- Forbidden imports list: explicit list of `from X import Y` statements that may NEVER appear in standalone files (e.g. `from app.infrastructure.db.models import ...`).

- [ ] **Step 4: Fill §4 (Schema patterns)**

Use the Edit tool. Required content:

- ESTABLISHED subsection: quote real post-fix code from `libs/idun_agent_schema/src/idun_agent_schema/standalone/agent.py` and `memory.py` with file:line refs. Show the camelCase aliasing pattern.
- FORWARD subsection for collection schemas: literal Python skeleton showing the locked field set:
  ```python
  class Standalone<Resource>Read(BaseModel):
      model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
      id: UUID
      slug: str
      name: str
      enabled: bool
      # position: Literal["input", "output"]   # guardrails only
      # sort_order: int                         # guardrails only
      <inner>: <ManagerShape>                   # manager-shape config; see §"Stored shape rule" in spec
      created_at: datetime
      updated_at: datetime
  ```
- One paragraph per resource (guardrails, mcp_servers, observability, integrations, prompts) covering: which manager shape is reused, where to find it in `idun_agent_schema.manager.*`, whether assembly conversion is needed.

- [ ] **Step 5: Fill §5 (ORM patterns)**

Use the Edit tool. Required content:

- ESTABLISHED subsection: quote real post-fix code from `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/db/models/agent.py` and `memory.py` with file:line refs.
- FORWARD subsection for collection ORMs: literal SQLAlchemy 2.x declarative skeleton:
  ```python
  class Standalone<Resource>Model(Base):
      __tablename__ = "standalone_<resource>"

      id: Mapped[str] = mapped_column(String(36), primary_key=True)
      slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
      name: Mapped[str] = mapped_column(String(255), nullable=False)
      enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
      <inner>_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
      created_at: Mapped[datetime] = mapped_column(
          DateTime(timezone=True), nullable=False, server_default=func.now()
      )
      updated_at: Mapped[datetime] = mapped_column(
          DateTime(timezone=True), nullable=False, server_default=func.now(),
          onupdate=func.now(),
      )
  ```
- Type substitution rules (engine-agnostic): `UUID(as_uuid=True)` → `String(36)`; `JSONB` → `JSON`. Cite spec §"Manager schema mirror rule".
- Manager mirror table: copy the table from spec §"Manager schema mirror rule" into this doc as a ready reference.

- [ ] **Step 6: Fill §6 (Router patterns) — six subsections**

Use the Edit tool. Each subsection has its own status tag:

- §6.1 Singleton router (ESTABLISHED): quote real post-fix code from `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/agent.py` and `memory.py`. Show the no-`{id}` route pattern.
- §6.2 Collection router (FORWARD): literal FastAPI router skeleton with the five standard endpoints (LIST, POST, GET {id}, PATCH {id}, DELETE {id}) and the envelope wrap.
- §6.3 PATCH semantics (FORWARD): one paragraph stating "shallow replace; client sends full nested config". Cite spec §"PATCH semantics" notes scattered across resource sections.
- §6.4 DELETE wrapping (FORWARD): explicit code showing the return type `StandaloneMutationResponse[StandaloneDeleteResult]` with `data = StandaloneDeleteResult(id=..., deleted=True)` and `reload = ...`.
- §6.5 Slug rules (FORWARD): copy the normalization pipeline from spec §"Identity → Slug rules (locked)" verbatim. Add a one-line example of `name="GitHub Tools"` → `slug="github-tools"`.
- §6.6 Connection-check sub-routes (FORWARD): three endpoint signatures from spec §"Connection checks", with the locked response shape `{ok: bool, details: object | null, error: str | null}`.

- [ ] **Step 7: Fill §7 (Mutation envelope + reload) — ESTABLISHED with stub-reload caveat**

Use the Edit tool. Required content:

- StandaloneMutationResponse[T] shape: quote from `libs/idun_agent_schema/src/idun_agent_schema/standalone/common.py`.
- StandaloneReloadResult + StandaloneReloadStatus shape: quote from `libs/idun_agent_schema/src/idun_agent_schema/standalone/reload.py`.
- HTTP 200-not-202 rule: explicit one-line statement plus a quote of the spec §"API response posture" rule.
- Stub-reload caveat: document the `_SAVED_RELOAD`, `_NOOP_RELOAD`, `_DELETE_RELOAD` constants in `api/v1/routers/{agent,memory}.py` with file:line refs. State explicitly: "Phase 3 will replace these stub constants with real reload outcomes from `commit_with_reload`. Phase 5+ collection routers may copy this stub pattern; Phase 3 will retrofit."

- [ ] **Step 8: Fill §8 (Validation rounds) — FORWARD**

Use the Edit tool. Required content:

- Copy the full table from spec §"Validation rounds" verbatim.
- Add a code skeleton showing the wrapping order:
  ```python
  async with reload_mutex:
      # Round 1: Pydantic body validation (FastAPI does this automatically)
      # Round 2: assembled EngineConfig validation
      try:
          assembled = assemble_engine_config(staged_state)
          EngineConfig.model_validate(assembled.model_dump())
      except ValidationError as exc:
          raise StandaloneValidationError(field_errors=...)
      # Round 3: engine reload
      try:
          await reload_runtime(assembled)
      except ReloadInitFailed as exc:
          await rollback_db()
          raise StandaloneReloadFailed(...)
  ```
- Note: `reload_mutex`, `assemble_engine_config`, `reload_runtime`, `StandaloneValidationError`, and `StandaloneReloadFailed` are FORWARD names locked by the spec but not yet implemented. Phase 3 builds them.

- [ ] **Step 9: Fill §9 (Error mapping) — ESTABLISHED partially**

Use the Edit tool. Required content:

- StandaloneAdminError shape: quote from `libs/idun_agent_schema/src/idun_agent_schema/standalone/errors.py`.
- StandaloneErrorCode enum values: list all (bad_request, validation_failed, not_found, conflict, reload_failed, auth_required, forbidden, unsupported_mode, rate_limited, internal_error).
- HTTP mapping table: copy from spec §"Error models" verbatim.
- Error mapper reference snippet: quote from `libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/errors.py` (the FastAPI exception handler that converts StandaloneAdminError to JSONResponse with the right HTTP status).

- [ ] **Step 10: Fill §10 (Reload mutex) — FORWARD**

Use the Edit tool. Required content:

- One paragraph: single in-process `asyncio.Lock`, held around the entire 3-round pipeline.
- Skeleton:
  ```python
  # libs/idun_agent_standalone/src/idun_agent_standalone/services/reload.py  (Phase 3)
  _reload_mutex = asyncio.Lock()

  async def commit_with_reload(...):
      async with _reload_mutex:
          # 3-round pipeline (see §8)
          ...
  ```
- Single-replica assumption: explicit one-line statement, citing spec §"Save/reload posture".

- [ ] **Step 11: Fill §11 (Cold-start states) — FORWARD**

Use the Edit tool. Required content:

- Copy the state table from spec §"Cold-start states" verbatim.
- Boot path pseudocode: copy from spec §"Cold-start states" verbatim.
- Explicit invariant: "the admin API and `/health` MUST come up even when the engine fails to start" — verbatim from spec.

- [ ] **Step 12: Fill §12 (Config hash) — FORWARD**

Use the Edit tool. Required content:

- One paragraph: `sha256(canonical_json(materialized EngineConfig))`, JCS / RFC 8785 canonicalization.
- Implementation hint: `rfc8785` PyPI package (or equivalent JCS-compliant library; lock the choice in Phase 6).
- Storage: `standalone_runtime_state.last_applied_config_hash`, surfaced in `GET /runtime/status`.

- [ ] **Step 13: Fill §13 (Test patterns)**

Use the Edit tool. Required content:

- Test file layout convention (ESTABLISHED partially):
  - Unit: `tests/unit/api/v1/routers/test_<resource>.py`
  - Unit: `tests/unit/db/test_models.py` (per-ORM test)
  - Integration: `tests/integration/test_<resource>_flow.py` (full reload + assembly)
- Fixture conventions: in-memory SQLite for unit tests; Postgres (via testcontainers or skipped under `requires_postgres` mark) for integration parity.
- Test gates per phase: copy the gate list from spec §"Future implementation test gates" verbatim, mapping each gate to a phase number.

- [ ] **Step 14: Fill §14 (Manager schema mirror rule) — ESTABLISHED + FORWARD**

Use the Edit tool. Required content:

- Mirror table: copy from spec §"Manager schema mirror rule" (the full table mapping manager tables → standalone tables).
- Type substitution list (engine-agnostic): `UUID(as_uuid=True)` → `String(36)`; `JSONB` → `JSON`; drop `workspace_id`; fold M:N junctions into row-level `enabled` + (where applicable) `position`/`sort_order`.
- Audit checklist for Phase 4 implementers (per ORM, applies to every new collection ORM):
  ```
  [ ] Same column names as the manager table?
  [ ] Same JSON content shape (manager Pydantic model dumps)?
  [ ] String(36) for UUID columns?
  [ ] SQLAlchemy JSON for JSONB columns?
  [ ] No `workspace_id` column?
  [ ] No imports from services/idun_agent_manager/?
  [ ] Junction columns folded into row-level fields?
  [ ] Standalone Base, not manager Base?
  ```
- ESTABLISHED reference: point at post-fix `agent.py` and `memory.py` ORM files with file:line refs.

- [ ] **Step 15: Fill §15 (Forbidden patterns)**

Use the Edit tool. Required content:

Exhaustive list, one line each, of every "no/never/forbidden" rule in the rework spec. At minimum:

- No `from app.*` imports inside `idun_agent_standalone/`.
- No imports of manager SQLAlchemy `*Model` classes.
- No SQLAlchemy `Base` shared with manager.
- No HTTP 202 for `restart_required`.
- No deep-merge PATCH (always shallow, full-object replace of nested configs).
- No association tables (M:N junctions are folded into row-level fields).
- No `workspace_id` columns on standalone tables.
- No engine-shape JSON in DB columns (manager-shape only; engine-shape is built at assembly).
- No `UUID(as_uuid=True)` or `JSONB` SQLAlchemy types (use `String(36)` and `JSON`).
- No slug-based lookup for singletons (no-`{id}` routes).
- No in-line schema definitions in routers (always import from `idun_agent_schema.standalone.*`).
- No `enabled` flag on singleton resources (agent, memory).
- No multi-replica assumptions (rate limit, reload mutex).

For each entry, cross-reference the spec section that locks the rule.

- [ ] **Step 16: Fill §16 (Open issues / known caveats)**

Use the Edit tool. Required content:

If the audit's deferred findings list contains anything that doesn't fit cleanly under a Phase 3+ class, record it here with the phase that will resolve it. If empty: write the literal sentence "No open issues at Phase 1 close." (no other content).

- [ ] **Step 17: Self-review pass on the doc**

Read the doc end-to-end. Verify each of these:

- Every ESTABLISHED snippet has a real file path + line reference (search the doc for "file:line" or "L\d+").
- Every FORWARD section has the FORWARD tag visible in the section body, not just inferable.
- §15 forbidden list cross-checks against spec — open the spec, search for "no ", "never", "forbidden", "must not"; confirm each hit is represented in §15.
- No "TBD", "TODO", "fill in later", "see X for details" without an actual link, or "implement later" anywhere.

If issues found, fix them inline. No re-review needed.

- [ ] **Step 18: Stage and commit the patterns doc**

Run:
```bash
git add docs/superpowers/specs/2026-04-27-rework-patterns.md
git status -sb
```
Expected: one staged file, no other changes.

Then:
```bash
git commit -m "$(cat <<'EOF'
docs(rework-phase1): patterns reference

Canonical reference doc for Phases 2-7 of the standalone admin/db rework.
Sixteen sections covering file layout, schema/ORM/router patterns, mutation
envelope + reload, validation rounds, error mapping, reload mutex,
cold-start states, config hash, test patterns, manager schema mirror rule,
forbidden patterns, and known caveats. ESTABLISHED rules cite real
post-fix code; FORWARD rules carry skeletons derived from the spec and
will be replaced with real snippets when their phase lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit on the working branch. Verify with `git log --oneline -1`.

---

## Task 5: CI gate (narrowed)

**Files:** none

The CI gate is narrowed to Phase 1's actual scope: the new tree. Pre-existing engine-side mypy debt and legacy-tied tests are explicitly out of scope (Phase 8 will handle them as part of the cut-over). See Task 0 Step 4 for the rationale.

- [ ] **Step 1: Run lint**

Run:
```bash
make lint
```
Expected: exit 0, no Ruff findings.

If it fails: fix the lint errors. If they're in legacy-tree files, that's a pre-existing failure — STOP and escalate; Phase 1 should not be the place to fix legacy lint debt.

- [ ] **Step 2: Run mypy on the new tree only**

Run:
```bash
uv run mypy \
  libs/idun_agent_schema/src/idun_agent_schema/standalone \
  libs/idun_agent_standalone/src/idun_agent_standalone/api \
  libs/idun_agent_standalone/src/idun_agent_standalone/core \
  libs/idun_agent_standalone/src/idun_agent_standalone/services \
  libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure
```
Expected: exit 0.

If it fails on new-tree files: a Task 3 fix didn't fully address its §6 class-11 finding. Go back to Task 3 for that finding. Pre-existing mypy debt elsewhere (engine, manager, legacy) is not Phase 1's responsibility.

- [ ] **Step 3: Run pytest (narrowed: schema + new-tree-safe standalone tests)**

Run:
```bash
uv run pytest libs/idun_agent_schema -q

uv run pytest libs/idun_agent_standalone -q \
  -m "not requires_postgres and not requires_langfuse and not requires_phoenix" \
  --ignore=libs/idun_agent_standalone/tests/unit/test_admin_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_reload.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_scaffold.py \
  --ignore=libs/idun_agent_standalone/tests/unit/test_cli.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_app_health.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_integrations_casing.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_structural_change_restart.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_state_correctness.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_auth_bootstrap.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_atomic.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_engine_reload_reattaches_observer.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_reload_flow.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_bootstrap_hash.py \
  --ignore=libs/idun_agent_standalone/tests/integration/test_config_io.py
```
Expected: each command exits 0.

If a test fails: investigate whether a Phase 1 fix caused it. If yes, the fix is wrong — go back to Task 3 for that finding. If no (legacy debt or unrelated), escalate.

- [ ] **Step 4: Verify acceptance criteria**

Per design doc §9, all of these must hold:

- [ ] Audit findings doc committed (Task 1)
- [ ] Every pattern-breaker has a fix commit referencing its ID (Task 3 loop)
- [ ] Patterns doc committed (Task 4)
- [ ] `make lint`, `make mypy`, and `pytest` all green (Task 5 Steps 1–3)

Manually confirm each by:

```bash
ls docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md
ls docs/superpowers/specs/2026-04-27-rework-patterns.md
git log --oneline c7dc9637..HEAD | grep -E "rework-phase1"
```
Expected: both files exist; commit log shows the audit doc, fix commits, and patterns doc commits in order.

---

## Task 6: Open the PR

**Files:** none

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feat/rework-phase1-audit-and-patterns
```
Expected: branch pushed; remote URL printed.

- [ ] **Step 2: Build the PR description**

Use the template below. Fill in the `<...>` slots from the actual audit findings and fix commits.

```markdown
## Phase 1 — Foundation Audit & Patterns Doc

Closes Phase 1 of the standalone admin/db rework.

### What this PR does
- Audits the agent + memory rework slices on the umbrella branch against the locked rework spec
- Fixes every drift classed as a pattern-breaker
- Drops the canonical patterns reference doc that Phases 2-7 will follow

### Audit summary
- <N> findings total, <M> pattern-breakers, <N-M> deferred
- See `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md`

### Pattern-breaker fixes
- P1-AF-001: <one-line>
- P1-AF-002: <one-line>
- ... (one bullet per fix commit)

### Patterns now ESTABLISHED
- File layout
- Schema patterns (singletons: agent, memory)
- ORM patterns (singletons: agent, memory)
- Singleton router pattern
- Mutation envelope + reload (with documented stub-reload transient)
- Error mapping
- Manager schema mirror (agent, memory)

### Patterns still FORWARD (locked by spec; reference snippet derived from spec)
- Schema/ORM/router patterns for collections
- PATCH semantics, DELETE wrapping, slug rules, connection-check sub-routes
- Validation rounds, reload mutex, cold-start states, config hash

### Test plan
- [x] `make lint` passes
- [x] `make mypy` passes
- [x] `uv run pytest -m "not requires_postgres and not requires_langfuse and not requires_phoenix"` passes
- [x] No new test failures vs the umbrella branch baseline

### Next phase
Phase 2 (`feat/rework-phase2-schemas`): complete the `idun_agent_schema.standalone` namespace per the patterns doc.
```

- [ ] **Step 3: Create the PR**

Run:
```bash
gh pr create \
  --base feat/standalone-admin-db-rework \
  --head feat/rework-phase1-audit-and-patterns \
  --title "Phase 1 — Foundation audit & patterns doc" \
  --body "$(cat <<'EOF'
<paste the filled-in description from Step 2>
EOF
)"
```
Expected: PR URL returned. Hand the URL back to the user.

- [ ] **Step 4: Final hand-back**

Report back to the user with:
- PR URL
- Commit count on the branch
- Audit summary line (`N findings, M pattern-breakers, all fixed`)
- Confirmation that all acceptance criteria are met

Phase 1 is complete. The user reviews the PR and merges into `feat/standalone-admin-db-rework`. Phase 2 then branches off the umbrella as `feat/rework-phase2-schemas`.

---

## End of plan

Acceptance summary (cross-references design doc §9):

1. Audit findings doc → committed in Task 1.
2. Pattern-breaker fixes referencing finding IDs → committed in Task 3 loop.
3. Patterns doc with the locked TOC → committed in Task 4.
4. Green CI → verified in Task 5.
5. PR description with the locked summary structure → built in Task 6 Step 2.
