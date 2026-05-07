# Standalone MVP Review — Phase 2 (Runtime Gaps) Design Spec

**Status:** Shipped — 2026-04-26

**Goal:** Address the 6 "Important Runtime Gaps" from the 2026-04-26 review so the standalone backend behaves correctly in production scenarios.

**Source review:** `docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md` — §"Important Runtime Gaps".

**Phase 1 prerequisites:** committed and pushed to `origin/feat/standalone-agent-mvp` (P1.1–P1.5).

---

## 1. Deliverables

### 1.1 Prompts → `EngineConfig.prompts` wiring

**Problem:** Prompt rows are seeded/exported and the admin UI exposes prompt management, but `config_assembly.py` doesn't query `PromptRow` or set `data["prompts"]`. Prompt admin changes don't affect runtime.

**Fix:** In `config_assembly.build_engine_config(...)`, query the `PromptRow` table and emit a `prompts` block that the engine recognizes. Schema lives in `idun_agent_schema` — confirm the engine accepts a `prompts` field at the engine-config level (or under `agent.config`). Adopt whatever shape the engine already supports.

**Acceptance:** New integration test that (a) seeds `PromptRow`s, (b) calls `build_engine_config`, (c) asserts the assembled config contains those prompts. Plus E2E-ish: edit a prompt via admin → reload → assembled config reflects the new prompt.

### 1.2 Integration provider casing normalization

**Problem:** Admin/storage paths can store lower-case provider names (`discord`), while schema validation expects upper-case (`DISCORD`). YAML bootstrap and admin CRUD diverge.

**Fix:** Normalize at boundaries — at every read from DB and every write to DB, coerce provider names through `IntegrationProvider(value.upper())` (or whatever the schema enum is). Write tests for lower-case YAML provider names AND admin-created integrations.

**Acceptance:** New tests verify (a) YAML bootstrap with `discord` lower-case produces a valid `IntegrationProvider.DISCORD`, (b) admin CRUD-created integration with mixed-case provider name is normalized to upper-case before assembly.

### 1.3 Password durability — DB-only after first boot

**Problem:** `_bootstrap_admin_user()` overwrites the DB hash from `IDUN_ADMIN_PASSWORD_HASH` on every boot. Admin-changed passwords silently revert after restart.

**Fix:** Change `_bootstrap_admin_user()` to seed the admin row from `IDUN_ADMIN_PASSWORD_HASH` only when the row doesn't exist yet. Subsequent boots leave the DB hash alone. To handle the "rotate the env hash to invalidate sessions" case, optionally compare and update only if the env hash differs AND a new opt-in env flag (`IDUN_FORCE_ADMIN_PASSWORD_RESET=1`) is set — but the default path is DB-only.

Document in:
- `libs/idun_agent_standalone/CLAUDE.md`
- `libs/idun_agent_standalone/src/idun_agent_standalone/auth/CLAUDE.md` if exists, else inline docstring
- A small note in the standalone docs page

**Acceptance:** New test verifies (a) first boot with empty DB seeds from env, (b) second boot with a different env hash leaves the DB hash unchanged, (c) third boot with `IDUN_FORCE_ADMIN_PASSWORD_RESET=1` re-seeds.

### 1.4 Enforce `IDUN_SESSION_SECRET` minimum length

**Problem:** Spec calls for 32+ char session secret; runtime accepts very short values.

**Fix:** In `StandaloneSettings.validate_for_runtime`, require `len(session_secret) >= 32` when `auth_mode == AuthMode.PASSWORD`. Raise a clear `ValueError`.

**Acceptance:** Settings test asserts a too-short secret raises `ValueError` mentioning "32 characters". Existing tests that already use 32-char secrets still pass (the existing `conftest.py` uses `"x" * 64` which is fine).

### 1.5 Trace event ordering across multi-run sessions

**Problem:** Trace replay orders by `sequence` only, but `sequence` is per `(thread_id, run_id)`. Sessions with multiple runs can interleave.

**Fix:** Change the order-by clause in `traces.routers` (the events query) to `(created_at ASC, run_id, sequence)` — this preserves intra-run sequence ordering AND keeps runs separated chronologically. If `created_at` lacks sub-second resolution, also fall back on `id` as a tiebreaker.

**Acceptance:** New test inserts 2 runs (`r1`, `r2`) into one session, each with `sequence=0..3`. Query the events endpoint. Assert the order is `r1.0, r1.1, r1.2, r1.3, r2.0, r2.1, ...` not `r1.0, r2.0, r1.1, r2.1, ...`.

### 1.6 Theme deep-merge

**Problem:** `runtime_config.py` shallow-merges DB theme over defaults. A partial persisted `colors` object replaces the whole color tree; a partial `colors.light` replaces the whole light scheme.

**Fix:** Replace shallow `dict.update` with a recursive deep-merge for the theme dict. Pydantic models can also do this via `model.model_copy(update=...)` but only one level deep — write a small `_deep_merge(default, override)` helper.

**Acceptance:** Test that loads defaults, persists `{"colors": {"light": {"accent": "#ff0000"}}}` only, and verifies the assembled runtime config still has all 18 keys in `colors.light` and all 18 keys in `colors.dark` (the defaults), with only `accent` overridden.

---

## 2. Architecture decisions

**D1: Prompts wire as a top-level engine config field.** If the engine schema already has `EngineConfig.prompts`, use it. If not, this is a schema change — flag it but don't introduce one in Phase 2; instead document the gap and skip 1.1 with a defer-note.

**D2: Casing normalization happens at boundaries.** Read and write paths in the admin router; YAML bootstrap also normalizes on import. The DB itself stores upper-case canonical values.

**D3: Password durability — DB-only is the default; env-driven rotation requires explicit opt-in.** The opt-in flag (`IDUN_FORCE_ADMIN_PASSWORD_RESET`) avoids surprise resets in long-lived deployments. Document clearly.

**D4: Session secret length — 32 chars is the floor.** Matches the spec's stated invariant.

**D5: Trace ordering uses `(created_at, run_id, sequence)`.** No schema change, just an ORDER BY tweak. Adding a session-global sequence column is a bigger lift; defer.

**D6: Theme deep-merge is recursive but type-blind.** Strings/numbers/lists override; dicts merge. Lists do NOT merge — this avoids surprising behavior when a deployer wants to replace the `starterPrompts` array.

---

## 3. Verification

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform

# Backend
uv run pytest libs/idun_agent_standalone/tests -q
# Expect: ≥ 82 + new tests (prompts, casing, password-bootstrap, session-secret, trace-ordering, theme-merge)

# Frontend (no UI changes in Phase 2; should remain green)
cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm test && pnpm build

# E2E should still pass (Phase 2 is pure backend)
pnpm test:e2e
```

---

## 4. Out of scope (Phase 3+)

- Login semantic tokens
- Chat history hydrate on session switch
- Trace search backend
- patchSession removal
- Responsive layouts
- a11y
- shadcn drift cleanup

---

## 5. Acceptance criteria

- All 6 runtime gaps resolved per §1.
- Standalone test suite passes with the new tests.
- Frontend stays green (no regressions).
- E2E stays green.
- Docs updated where the password durability model is described.
