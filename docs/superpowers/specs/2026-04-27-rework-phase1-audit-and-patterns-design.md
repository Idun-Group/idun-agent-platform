# Rework Phase 1 — Foundation Audit & Patterns Doc

Date: 2026-04-27

Branch: `feat/rework-phase1-audit-and-patterns` (off `feat/standalone-admin-db-rework`)

Status: Brainstormed and locked. Implementation has not started.

Authoritative source: `docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md` (the rework spec). When this doc and the spec disagree, the spec wins.

## 1. Purpose

Phase 1 is the gate phase of the standalone admin/db rework. It does **not** add new resources, ORMs, routers, or endpoints. Its job is to:

1. Verify that the agent + memory rework slices already on `feat/standalone-admin-db-rework` (commits `10018468..fd90d8bb`) conform to the locked spec.
2. Fix every drift that would propagate via copy-paste into Phases 2–7 (pattern-breakers).
3. Capture the rules every later phase must follow in a single canonical reference doc that subagents can read and apply.

If Phase 1 ships with drift, that drift compounds across six remaining phases. The cost of slow, careful work here is bounded; the cost of pattern leak across the rework is not.

## 2. Deliverables

Three artifacts:

1. **Audit findings doc** at `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md` — drift report comparing the rework slices in tree against the spec. Drives the fix work; serves as historical record post-merge.
2. **Pattern-breaker fix commits** — one commit per finding class, each referencing the audit finding ID it resolves.
3. **Patterns reference doc** at `docs/superpowers/specs/2026-04-27-rework-patterns.md` — rules + canonical reference snippets covering both ESTABLISHED (proven by current code) and FORWARD (locked by spec; skeleton derived from spec) patterns. Subagents in Phases 2–7 read this doc to apply consistent patterns without re-deriving them.

## 3. Audit scope

In scope (the "new tree"):

- `libs/idun_agent_schema/src/idun_agent_schema/standalone/` (every file).
- `libs/idun_agent_standalone/src/idun_agent_standalone/api/` (every file).
- `libs/idun_agent_standalone/src/idun_agent_standalone/core/` (every file).
- `libs/idun_agent_standalone/src/idun_agent_standalone/services/` (every file).
- `libs/idun_agent_standalone/src/idun_agent_standalone/infrastructure/` (every file).
- The standalone-side surface of the engine FastAPI integration commit (`2e63e234`). Engine-side code in that commit is treated as stable and not audited.

Out of scope (the "legacy tree"):

- `libs/idun_agent_standalone/src/idun_agent_standalone/admin/`
- `libs/idun_agent_standalone/src/idun_agent_standalone/auth/`
- `libs/idun_agent_standalone/src/idun_agent_standalone/db/` (legacy `base.py`, `migrate.py`, `models.py`, and the legacy `migrations/`)
- `libs/idun_agent_standalone/src/idun_agent_standalone/traces/`
- `libs/idun_agent_standalone/src/idun_agent_standalone/theme/` (preserved as legacy survivor per spec; not audited or modified)
- Root-level legacy modules: `app.py`, `cli.py`, `reload.py`, `config_assembly.py`, `config_io.py`, `runtime.py`, `settings.py`, `middleware.py`, `errors.py`, `runtime_config.py`, `scaffold.py`, `testing.py`, `testing_app.py`.
- Test files that exercise legacy modules. New-tree tests (if any exist under `tests/unit/api/`, `tests/unit/core/`, `tests/unit/services/`, `tests/unit/infrastructure/`, `tests/unit/db/test_models.py` for new ORMs) are checked only for "do they encode wrong patterns"; deeper coverage is a Phase 5+ concern.
- Engine-side code and UI-side code beyond the standalone admin integration point.

## 4. Audit method

A single Explore subagent does the read-only audit. Its inputs:

- The spec file path (`docs/superpowers/specs/2026-04-27-standalone-admin-config-db-design.md`) — the law it audits against.
- The commit range to audit (`10018468..fd90d8bb`).
- The pattern-breaker checklist below (§6) — the only classes of drift that count as Phase 1 fixes.
- The output format spec (§5) — what the findings doc looks like.

The subagent does NOT propose fixes. It reports drift only. Triage and fix dispatch happen on the main thread.

## 5. Audit findings doc

Format:

```markdown
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
**Drift:** what the spec requires vs what the code does (concrete, with quoted snippets)
**Impact:** what would happen if this pattern propagates to Phase 2-7
**Defer to:** (only for deferred findings) which phase will absorb this

(repeat per finding, IDs P1-AF-001, P1-AF-002, ...)

## Patterns confirmed correct
- one-line confirmation per major pattern that matches the spec
```

Findings get stable IDs (`P1-AF-NNN`) so fix commits and the patterns doc can reference them.

## 6. Pattern-breaker checklist

The audit verifies these ten classes of pattern. Drift in any of them is a pattern-breaker (Phase 1 fix). Drift outside these is deferred to a later phase, with the target phase named in the finding.

1. **Mutation envelope shape.** All POST/PATCH/DELETE responses use `StandaloneMutationResponse[T]` with `data` and `reload` fields. DELETE in particular is wrapped in the envelope, not bare.
2. **Reload status enum + HTTP behavior.** `StandaloneReloadStatus` matches the spec exactly (`reloaded`, `restart_required`, `reload_failed`). HTTP behavior aligns: 200 for both `reloaded` and `restart_required`; never 202.
3. **Error envelope.** `StandaloneAdminError` matches the spec (code enum, message, details, field_errors). Error code enum includes `bad_request` and `rate_limited`. The error mapper converts these to the right HTTP codes per the spec's HTTP mapping table.
4. **Case convention.** JSON keys are camelCase outbound (Pydantic `alias_generator=to_camel`, `populate_by_name=True`). Enum values are snake_case. Path segments are kebab-case.
5. **File layout.** Files live where the spec's "Proposed codebase organization" expects them: schemas in `idun_agent_schema/standalone/`, ORMs in `idun_agent_standalone/infrastructure/db/models/`, routers in `idun_agent_standalone/api/v1/routers/`, services in `idun_agent_standalone/services/`, core helpers in `idun_agent_standalone/core/`.
6. **Manager schema mirror rule.** ORMs use engine-agnostic types (`String(36)` for UUID, SQLAlchemy `JSON` for JSONB), match manager column names + JSON content shape 1:1 (minus `workspace_id` and junctions), and do not import from `services/idun_agent_manager/`. No `from app.*` imports inside `idun_agent_standalone/`. SQLAlchemy `Base` is not shared with manager.
7. **Stored shape rule.** Resource JSON columns store manager-shape Pydantic dumps (`ManagedMemoryRead/Patch`, `ManagerGuardrailConfig`, `MCPServer`, etc.), not engine-shape or invented standalone shapes. Where conversion is needed at assembly (memory framework mapping, guardrails), the manager converter is reused (e.g. `convert_guardrail`).
8. **Singleton route shape.** Singleton resources (agent, memory) use no-`{id}` routes (`/admin/api/v1/agent`, `/admin/api/v1/memory`). DB row PK is fixed (e.g. `"singleton"` for memory; UUID held for cross-system identity but not used in URLs). No slug-based lookup for singletons.
9. **Schema namespace usage.** Routers import their request/response shapes from `idun_agent_schema.standalone.*`, not from inline definitions or local stub modules.
10. **Forbidden patterns.** Cross-cuts the above: no `from app.*` imports, no 202 for restart_required, no deep-merge PATCH, no association tables, no `workspace_id` columns, no engine-shape JSON in DB columns.

Drift CLASSED AS DEFERRED (will land in a later phase, not fixed in Phase 1):

- Reload mutex absence — Phase 3
- 3-round validation pipeline absence — Phase 3
- Slug rules absence — Phase 5 (singletons don't need slugs)
- Login rate limit, CORS, CSRF — Phase 7
- Cold-start state machine — Phase 6
- Config hash (JCS) — Phase 6
- Connection-check endpoints — Phase 6
- Routers other than agent + memory — Phases 5–6
- Test coverage expansion — Phases 5–7
- Cosmetic issues (helper extraction, naming, docstrings) — Phase 5+ as they surface

## 7. Triage and fix dispatch

After the audit findings doc lands:

1. I read the findings on main thread.
2. For each finding marked pattern-breaker, decide:
   - Single-file edit → main thread.
   - Multi-file edit (e.g., envelope shape change touching both routers + tests) → fix subagent with the spec excerpt, the audit finding, and the exact files to touch.
3. Fix commits are tagged `fix(rework-phase1): <one-line summary>` and reference the finding ID in the commit body.
4. After each fix, run the relevant test scope (unit + integration for the touched router); after all fixes, run `make ci` end-to-end.

If the audit produces findings classed as pattern-breaker that exceed a reasonable Phase 1 budget, I escalate to the user before fixing. The bar in §6 is intentionally narrow precisely to keep this from happening.

## 8. Patterns doc

Written ON THE MAIN THREAD (not a subagent). The rules need careful phrasing and the reference snippets need careful selection; this is craft work that benefits from full context.

Structure: per the TOC locked in brainstorming Section 2 (16 sections, ~600 lines target). The TOC is reproduced here for reference:

```
1. Purpose, audience, and how to use this doc
2. Spec linkage
3. File layout (ESTABLISHED)
4. Schema patterns (ESTABLISHED for singletons; FORWARD for collections)
5. ORM patterns (ESTABLISHED for singletons; FORWARD for collections)
6. Router patterns
   6.1 Singleton router (ESTABLISHED)
   6.2 Collection router (FORWARD)
   6.3 PATCH semantics (FORWARD)
   6.4 DELETE wrapping (FORWARD)
   6.5 Slug rules (FORWARD)
   6.6 Connection-check sub-routes (FORWARD)
7. Mutation envelope + reload (ESTABLISHED, with stub-reload caveat)
8. Validation rounds (FORWARD)
9. Error mapping (ESTABLISHED partially)
10. Reload mutex (FORWARD)
11. Cold-start states (FORWARD)
12. Config hash (FORWARD)
13. Test patterns
14. Manager schema mirror rule (ESTABLISHED + FORWARD)
15. Forbidden patterns
16. Open issues / known caveats
```

Two flavors of section content:

- **ESTABLISHED** sections quote real code from the now-fixed agent + memory slices. Each rule has a concrete reference excerpt with file path + line numbers anchored to the post-fix state.
- **FORWARD** sections show a reference skeleton derived from the spec, marked clearly with the FORWARD tag. When a phase implements a forward pattern for real, that phase's PR updates the doc to replace the skeleton with a reference snippet from the real code (and removes the FORWARD tag).

The `_SAVED_RELOAD / _NOOP_RELOAD / _DELETE_RELOAD` stub constants in `api/v1/routers/{agent,memory}.py` are documented in §7 as "what current code does until Phase 3 lands the real reload mutex + 3-round pipeline." They are NOT classed as pattern-breakers; subagents in Phases 5+ may copy the stub pattern and trust Phase 3 to retrofit.

Forbidden patterns get §15 so subagents can scan "what not to do" quickly. The list there is exhaustive of every "no/never/forbidden" rule the spec lays down.

## 9. Acceptance criteria

Phase 1 is done when all of these hold:

1. Audit findings doc is committed to `docs/superpowers/reviews/2026-04-27-rework-phase1-audit.md`.
2. Every finding marked pattern-breaker in the audit doc has at least one fix commit referencing its ID in the commit body.
3. Patterns doc is committed to `docs/superpowers/specs/2026-04-27-rework-patterns.md` and follows the §8 TOC.
4. `make ci` (lint + mypy + pytest) passes on `feat/rework-phase1-audit-and-patterns`.
5. The PR description summarizes which patterns are now ESTABLISHED, which remain FORWARD, and lists each pattern-breaker fix one-line.

## 10. Branch and commit structure

Branch: `feat/rework-phase1-audit-and-patterns`, branched from current tip of `feat/standalone-admin-db-rework`.

Commits, in order:

1. `docs(rework-phase1): add Phase 1 design doc` — drops THIS doc.
2. `docs(rework-phase1): audit findings` — drops the audit doc to `docs/superpowers/reviews/`.
3. `fix(rework-phase1): <pattern-breaker title>` — N commits, one per finding class. Each references its `P1-AF-NNN` ID in the body.
4. `docs(rework-phase1): patterns reference` — drops the patterns doc.

PR target: `feat/standalone-admin-db-rework` (the umbrella).

## 11. Non-goals

Phase 1 explicitly does NOT:

- Add new resources, ORMs, or routers.
- Implement reload mutex, 3-round validation, slug rules, cold-start state, config hash, or connection-checks.
- Touch legacy code (the legacy-tree paths enumerated in §3).
- Pull anything from Phases 2–7 forward, even if the audit surfaces "we could just fix this now too" temptations.
- Expand test coverage beyond what's needed to keep CI green after fix commits.

Phase 1 may modify test files in the new tree (under `tests/`) where a fix breaks them; that's still in scope.

## 12. Risks

- **Audit produces too many pattern-breakers.** Mitigation: the §6 bar is intentionally restrictive (10 classes, all named). Anything outside those classes is deferred. If even within those classes the volume is unmanageable, escalate to user.
- **Forward patterns in the doc are wrong.** Mitigation: every forward pattern is tagged FORWARD. Phase 2–7 PRs are expected to refine them. The doc is a living artifact; the spec is the law.
- **Dual existence of new + legacy code confuses the audit.** Mitigation: §3 explicitly excludes legacy paths. The subagent prompt repeats the scope with file-path globs.
- **The `_SAVED_RELOAD` stub gets misread as a pattern-breaker.** Mitigation: §8 documents it as a known transient. Audit checklist (§6) does not include "real reload outcomes" — that's Phase 3.

## 13. Next step after approval

Once this doc is approved:

1. Commit it as `docs(rework-phase1): add Phase 1 design doc`.
2. Invoke `superpowers:writing-plans` to produce a task-by-task implementation plan at `docs/superpowers/plans/2026-04-27-rework-phase1.md`. Plan tasks follow §10's commit order.
3. Execute the plan via `superpowers:subagent-driven-development` (audit subagent → triage → fix subagents → patterns doc on main thread).
