# Standalone MVP Review — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Resolve the 6 runtime gaps from `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase2-design.md`.

**Architecture:** 6 self-contained tasks. Recommended batching for subagent dispatch:
- **Batch A** — settings/auth: P2.3 (password durability) + P2.4 (session secret length). Same file: `settings.py` + the auth bootstrap.
- **Batch B** — config assembly: P2.1 (prompts wiring) + P2.2 (integration casing) + P2.6 (theme deep-merge). All touch `config_assembly.py` / `theme/runtime_config.py`.
- **Batch C** — trace ordering: P2.5 standalone.

---

## Task P2.1 — Prompts → `EngineConfig.prompts` wiring

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/config_assembly.py`
- Test: `libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py` (new)

- [ ] **Step 1: Verify the engine schema accepts a `prompts` field.** `grep -rn "prompts" libs/idun_agent_schema/src/`. Specifically look in `engine/` for a Pydantic model with a `prompts` attribute. If found, note the exact shape (likely `dict[str, str]` or `list[PromptDef]`).
- [ ] **Step 2: If no engine schema field exists**, the gap is bigger than this task — document and stop. Add a note to the review file under §"P2.1 deferred: engine schema lacks prompts field".
- [ ] **Step 3: Otherwise** read `config_assembly.py` to find where the engine config dict is built. Add a query for `PromptRow` (use the existing async session helper) and inject the prompts into the assembled dict at the right place.
- [ ] **Step 4: Write `test_prompts_wiring.py`:**

```python
"""Phase 2 P2.1: Admin-edited prompts must reach the assembled engine config."""

import pytest
from idun_agent_standalone.config_assembly import build_engine_config
from idun_agent_standalone.db.models import PromptRow


@pytest.mark.asyncio
async def test_prompt_rows_reach_assembled_config(standalone_app):
    app, sm = standalone_app
    async with sm() as session:
        session.add(PromptRow(prompt_key="greeting", content="Hello {name}", version=1))
        await session.commit()

    cfg = await build_engine_config(app)
    # Adapt assertion to whatever shape the engine accepts:
    assert "prompts" in cfg or any(
        p.get("prompt_key") == "greeting" for p in (cfg.get("agent", {}).get("config", {}).get("prompts", []) or [])
    )
```

- [ ] **Step 5: Run** `uv run pytest libs/idun_agent_standalone/tests/integration/test_prompts_wiring.py -v`.
- [ ] **Step 6: Run full standalone suite:** `uv run pytest libs/idun_agent_standalone/tests -q`.
- [ ] **Step 7: Commit:**

```
fix(standalone): wire admin-edited prompts into assembled EngineConfig (P2.1)

Per docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md.
```

---

## Task P2.2 — Integration provider casing normalization

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/integrations.py` (or wherever integration CRUD lives)
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/config_io.py` (YAML bootstrap)
- Test: `libs/idun_agent_standalone/tests/integration/test_integrations_casing.py` (new)

- [ ] **Step 1: Locate the schema enum.** `grep -rn "class IntegrationProvider" libs/idun_agent_schema/src/`. Note the canonical case (likely upper).
- [ ] **Step 2: Add a normalize helper** — either inline or in a shared module:

```python
def _normalize_provider(name: str) -> str:
    """Return the canonical (upper-case) IntegrationProvider value or raise."""
    from idun_agent_schema.integrations import IntegrationProvider  # adjust path
    return IntegrationProvider(name.upper()).value
```

- [ ] **Step 3: Apply at the admin router** for both `POST` (create) and `PATCH` (update) — normalize `provider` (or `kind`) before persisting.
- [ ] **Step 4: Apply at YAML bootstrap** — `config_io.import_yaml` (or wherever the integrations are read from YAML) — normalize on import.
- [ ] **Step 5: Apply at read paths** if storage might already contain lower-case rows from before this fix — defensive normalization on `integrations` list materialization.
- [ ] **Step 6: Write `test_integrations_casing.py`:** tests for (a) YAML import with lower-case `discord`, (b) admin POST with `Discord`, (c) both produce canonical `DISCORD` in the DB and assembled config.
- [ ] **Step 7: Run + commit.**

---

## Task P2.3 — Password durability: DB-only after first boot

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/app.py` (or wherever `_bootstrap_admin_user` lives — `grep -rn "_bootstrap_admin_user"`)
- Modify: `libs/idun_agent_standalone/CLAUDE.md` (auth section)
- Test: `libs/idun_agent_standalone/tests/unit/test_admin_bootstrap.py` (new or extend existing)

- [ ] **Step 1: Locate `_bootstrap_admin_user`.** Read it. The current behavior: every boot writes `AdminUserRow(id="admin", password_hash=settings.admin_password_hash)`.
- [ ] **Step 2: Change behavior:**
  1. Query existing `AdminUserRow` first.
  2. If none exists → seed from `settings.admin_password_hash` (same as today).
  3. If one exists → leave it alone, UNLESS `os.environ.get("IDUN_FORCE_ADMIN_PASSWORD_RESET") == "1"`, in which case overwrite from env (and log a warning).
  4. Always-create migration is unaffected.
- [ ] **Step 3: Add `StandaloneSettings.force_admin_password_reset: bool = Field(default=False, alias="IDUN_FORCE_ADMIN_PASSWORD_RESET")`** if you want a typed approach (preferred over raw `os.environ`).
- [ ] **Step 4: Tests** in `tests/unit/test_admin_bootstrap.py`:

```python
@pytest.mark.asyncio
async def test_first_boot_seeds_from_env(tmp_path, monkeypatch):
    # ... DB empty + IDUN_ADMIN_PASSWORD_HASH set → row created with that hash
    pass

@pytest.mark.asyncio
async def test_second_boot_does_not_overwrite_existing_row(tmp_path, monkeypatch):
    # ... DB has admin row with hash A; env has hash B; boot → row still has A
    pass

@pytest.mark.asyncio
async def test_force_reset_overwrites_existing_row(tmp_path, monkeypatch):
    # ... DB has hash A; env has hash B; IDUN_FORCE_ADMIN_PASSWORD_RESET=1; boot → row has B
    pass
```

- [ ] **Step 5: Document** in `libs/idun_agent_standalone/CLAUDE.md` — under the Auth section, add:

```
**Password rotation:** On first boot, the admin row is seeded from
`IDUN_ADMIN_PASSWORD_HASH`. After that, the DB is the source of truth —
admin password changes via the UI are durable across restarts. Re-seed
from env by setting `IDUN_FORCE_ADMIN_PASSWORD_RESET=1` for one boot.
```

- [ ] **Step 6: Run + commit.**

---

## Task P2.4 — Session secret minimum length

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/settings.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_settings.py` (extend if exists, else new)

- [ ] **Step 1:** In `StandaloneSettings.validate_for_runtime`, after the existing checks for `password` mode, add:

```python
if self.auth_mode == AuthMode.PASSWORD:
    if not self.session_secret or len(self.session_secret) < 32:
        raise ValueError(
            "IDUN_SESSION_SECRET must be at least 32 characters when "
            "IDUN_ADMIN_AUTH_MODE=password (got "
            f"{len(self.session_secret or '')})."
        )
```

(Place this AFTER the existing `if not self.session_secret` check so the error message is more specific.)

- [ ] **Step 2: Test:**

```python
def test_session_secret_too_short_raises(monkeypatch):
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", "$2b$12$abc...")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "tooshort")
    s = StandaloneSettings()
    with pytest.raises(ValueError, match="32 characters"):
        s.validate_for_runtime()
```

- [ ] **Step 3: Verify** existing tests with `"x" * 64` secrets still pass.
- [ ] **Step 4: Run + commit.**

---

## Task P2.5 — Trace event ordering across multi-run sessions

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py` (the events query)
- Test: `libs/idun_agent_standalone/tests/integration/test_trace_event_ordering.py` (new)

- [ ] **Step 1: Find the order-by clause** in the events query. Likely `order_by(TraceEventRow.sequence.asc())`.
- [ ] **Step 2: Replace with:**

```python
.order_by(
    TraceEventRow.created_at.asc(),
    TraceEventRow.run_id.asc(),
    TraceEventRow.sequence.asc(),
    TraceEventRow.id.asc(),  # tiebreaker
)
```

- [ ] **Step 3: Test:**

```python
@pytest.mark.asyncio
async def test_multi_run_events_do_not_interleave(standalone_app):
    """Events from run A and run B in the same session must be grouped, not interleaved."""
    app, sm = standalone_app
    async with sm() as session:
        for run_id in ("r1", "r2"):
            for seq in range(3):
                session.add(TraceEventRow(
                    session_id="t1", run_id=run_id, sequence=seq,
                    event_type="x", payload={}, created_at=...
                ))
        await session.commit()

    # Hit GET /admin/api/v1/traces/sessions/t1/events
    # Expected order: r1.0, r1.1, r1.2, r2.0, r2.1, r2.2
    # NOT: r1.0, r2.0, r1.1, r2.1, ...
```

Use small `created_at` deltas between runs (run 1 happens before run 2).

- [ ] **Step 4: Run + commit.**

---

## Task P2.6 — Theme deep-merge

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/theme/runtime_config.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_theme_merge.py` (new)

- [ ] **Step 1: Find the shallow merge.** `grep -n "update\|merge" libs/idun_agent_standalone/src/idun_agent_standalone/theme/runtime_config.py`. The `mergeWithDefaults` (or similar) function shallow-merges `default | persisted` style.
- [ ] **Step 2: Replace with `_deep_merge`:**

```python
def _deep_merge(default: dict, override: dict) -> dict:
    """Recursive merge: dicts merge, scalars/lists override."""
    out = dict(default)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out
```

- [ ] **Step 3: Test:**

```python
def test_partial_color_override_preserves_unset_keys():
    override = {"colors": {"light": {"accent": "#ff0000"}}}
    merged = merge_theme(DEFAULT_THEME, override)
    assert merged["colors"]["light"]["accent"] == "#ff0000"
    # All 18 light keys still present
    assert set(merged["colors"]["light"].keys()) == set(DEFAULT_THEME["colors"]["light"].keys())
    # Dark scheme entirely untouched
    assert merged["colors"]["dark"] == DEFAULT_THEME["colors"]["dark"]
```

- [ ] **Step 4: Run + commit.**

---

## Wrap-up

After all 6 tasks land:

1. Full backend test suite passes (≥ 82 + new tests).
2. Frontend stays green.
3. E2E stays green.
4. Update review doc to mark P2 items resolved.
