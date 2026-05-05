# Config UX bundles — design

**Date:** 2026-05-05
**Branch base:** `feat/migrate-standalone-mvp`
**Umbrella branch:** `feat/config-ux`
**Status:** Spec locked, awaiting plan

## Why

The standalone agent platform has three classes of config-UX gap that compound into a poor operator experience:

1. **Errors are toast-shaped, not field-shaped.** The backend already emits structured `field_errors` with dotted paths, but the UI throws everything into a generic toast. Operators see "Save failed" and have to guess.
2. **Broken-config detection happens too late.** A typo in `graph_definition` only surfaces at engine reload (round 3) as a flat `reload_failed` code. The operator can't tell whether the file is missing, the variable is wrong, or the import broke at the top of the module.
3. **Form polish lags the deprecated manager web.** Six admin pages duplicate header markup; tag-shaped fields use comma-strings; no unsaved-changes warning when the user closes the tab; no contextual docs links.

This spec covers three independent bundles that together close those gaps. They share an umbrella branch but ship as separate child PRs so review stays bounded.

## Bundle scope at a glance

| Bundle | What | PR | Items |
|---|---|---|---|
| **A — Status & Errors** | Surface runtime state, route `field_errors` to forms, show engine version | PR-1 | runtime_status route, `applyFieldErrors` helper, version chip, reload-failed banner |
| **B — File-reference validation** | Catch broken paths at save time with field-mapped errors; add a dry-run flag for live validation | PR-2 | engine validator extraction, round-3 classifier, `?dryRun=true` on every mutation, frontend regex |
| **C — Form polish** | Unify admin headers, install shadcn Combobox-with-chips for tag fields, guard tab-close on dirty forms | PR-3 | `<AdminPageHeader>`, shadcn Combobox primitive, `useBeforeUnload`, dead-code cleanup |

**Out of bundle scope** (consciously deferred): per-field tooltip help icons, sidebar-click navigation guards, env-var resolution check at save time, ADK/Haystack file-ref validators, mobile-responsive header tweaks, i18n.

## Topology

```
main
  └─ feat/migrate-standalone-mvp                  (current parent)
       └─ feat/config-ux                          (umbrella, opens against mvp)
            ├─ PR-1  feat/config-ux-status-errors        (Bundle A)
            ├─ PR-2  feat/config-ux-file-ref             (Bundle B + engine refactor)
            └─ PR-3  feat/config-ux-form-polish          (Bundle C)
```

**PR dependencies:** PR-2 depends on PR-1 being merged (consumes `applyFieldErrors`). PR-3 is independent.

**Recommended sequence:** PR-1 → PR-2 → PR-3, but PR-3 can land first if it's ready.

## Shared deliverables

Some artifacts span bundles. Ownership is fixed to the first PR that needs them.

| Shared piece | Owner PR | Reason |
|---|---|---|
| `lib/api/client.ts`: `ApiError.fieldErrors: FieldError[]` parsed at throw site | PR-1 | A's `field_errors` mapping introduces it; B and C consume it |
| `lib/api/form-errors.ts`: `applyFieldErrors(form, error, pathMap?)` helper | PR-1 | Same |
| `components/admin/AdminPageHeader.tsx` | PR-3 | C's prerequisite for #15 / #16 |
| `hooks/use-before-unload.ts` | PR-3 | Pairs with isDirty already on header |
| `components/ui/combobox.tsx` (added via `npx shadcn@latest add combobox`) | PR-3 | Used by guardrails tag-shaped fields. Zero new code authored — copied from upstream per shadcn's distribution model |
| Engine refactor: `validate_graph_definition(framework, definition, project_root)` callable | PR-2 | Solo consumer is B |
| `services/error_classifier.py` (round-3 taxonomy) | PR-2 | Tied to round-3 mapping |
| `?dryRun=true` query param on the **agent** PATCH (other 6 routers deferred until they have a real call site) | PR-2 | Couples with file-ref validator |

---

# Bundle A — Status & Errors

## Goal

Transform error feedback from "toast + reload" to **field-precise + status-aware**. Three deliverables.

## Components

### Backend
- **NEW** `GET /admin/api/v1/runtime/status` — reads `runtime_state` row; returns `{lastStatus, lastMessage, lastError, lastAppliedConfigHash, lastReloadedAt}`. 404 when no row exists yet (fresh install).
- **NEW** `StandaloneRuntimeStatusRead` Pydantic model in `idun_agent_schema.standalone`. Mirrors the row, camelCase wire keys per existing convention.

### Frontend api layer
- **CHANGED** `lib/api/client.ts` — `ApiError` carries `fieldErrors: FieldError[]` parsed once at throw site, replacing the `error.detail.error.fieldErrors` two-hop.
- **NEW** `lib/api/form-errors.ts`:
  ```ts
  export function applyFieldErrors(
    form: UseFormReturn<any>,
    error: unknown,
    pathMap?: Record<string, string>,
  ): boolean {
    if (!(error instanceof ApiError)) return false;
    if (error.fieldErrors.length === 0) return false;
    for (const fe of error.fieldErrors) {
      const formPath = pathMap?.[fe.field] ?? fe.field;
      form.setError(formPath as any, { message: fe.message, type: fe.code ?? "server" });
    }
    return true;
  }
  ```
  Returns `true` when at least one field path was applied → caller skips toast. Returns `false` when no field_errors → caller falls back to toast.
- **NEW** `api.getRuntimeStatus()` typed wrapper.

### Frontend pages and shell
- **CHANGED** `app/admin/agent/page.tsx`:
  - New "Runtime status" card showing `lastStatus / lastError / lastAppliedConfigHash / lastReloadedAt`.
  - Engine version chip in the page header (existing `checkAgentHealth` already returns `version`; UI currently drops it).
- **NEW** `components/admin/ReloadFailedBanner.tsx` — sticky top banner; renders only when `runtime_status.lastStatus === "reload_failed"`.
- **CHANGED** `app/admin/layout.tsx` — mounts `<ReloadFailedBanner>` once for all admin pages.

## Data flow

```
operator save → admin PATCH → reload pipeline → runtime_state row updated
                                                       ↓
                       polling (60s) ← /admin/api/v1/runtime/status ← TanStack Query
                                                       ↓
                               { lastStatus, lastError, ... }
                                ↓                          ↓
              <ReloadFailedBanner> (shell)         <RuntimeStatusCard> (/admin/agent)
              (only when status=reload_failed)     (always rendered when fetched)
```

For field_errors:

```
backend mutation → 422 with field_errors → ApiError thrown w/ pre-parsed fieldErrors
                                                       ↓
        page onError → applyFieldErrors(form, e, pathMap) returns true
                                                       ↓
                if true: skip toast (errors are inline)
                if false: show toast (no field_errors, only top-level message)
```

## Engine version chip

- **Display location:** page header (top-right of `/admin/agent`), not inside the Connection card. Always visible without clicking Verify.
- **Outdated indicator:** **none.** No PyPI lookup. The standalone is positioning as a self-hosted OSS product; an automatic outbound call to PyPI to compare versions is a phone-home users haven't consented to. If demand surfaces later, an on-demand "Check for updates" button can land in a P3 polish bundle.

## Backend → form path mapping

The backend emits dotted paths like `agent.config.graphDefinition`; the agent form binds to `definition`. Per-page path map handles the translation:

```ts
onError: (e) => {
  if (!applyFieldErrors(form, e, { "agent.config.graphDefinition": "definition" })) {
    toast.error(extractMessage(e));
  }
}
```

Why per-page maps instead of automatic tail-matching: tail-matching collides when two fields share a tail name. Per-page maps are explicit, small (most pages have ≤5 form fields), and easy to maintain.

## Error handling

- `runtime/status` query: if 404, render nothing (treat as `lastStatus = "never_reloaded"`). Don't error-toast.
- `applyFieldErrors`: returns `false` when no field_errors → caller toasts. Returns `true` → caller skips toast.
- Unknown field paths: log a `console.warn`, do not throw. Per-page `pathMap` is the source of truth.

## Testing

- **Backend:** pytest unit on the `runtime_status` router (returns row; returns 404 when absent). Pytest integration: post a bad config → row updates → next GET reflects the failure.
- **Frontend:** vitest for `applyFieldErrors` (calls `form.setError` per FieldError, respects pathMap, returns boolean correctly). Vitest for `<ReloadFailedBanner>` (renders only when `lastStatus === "reload_failed"`).

---

# Bundle B — File-reference validation pipeline

## Goal

Move broken-config detection from **round 3 (engine init at reload time)** to **round 2.5 (save time)**, with field-mapped errors that point the operator at the wrong field. Plus a dry-run endpoint for live validation as the user types.

## Components

### Engine refactor
- **NEW** `libs/idun_agent_engine/.../agent/validation.py`:
  ```python
  class GraphValidationCode(StrEnum):
      FILE_NOT_FOUND = "file_not_found"
      IMPORT_ERROR = "import_error"
      ATTRIBUTE_NOT_FOUND = "attribute_not_found"
      WRONG_TYPE = "wrong_type"

  class GraphValidationResult(BaseModel):
      ok: bool
      code: GraphValidationCode | None
      message: str
      hint: str | None  # e.g. "did you mean 'graph' instead of 'app'?"

  def validate_graph_definition(
      framework: AgentFramework,
      definition: str,         # "./agent.py:graph"
      project_root: Path,
  ) -> GraphValidationResult: ...
  ```
- **CHANGED** `agent/langgraph/langgraph.py:_load_graph_builder` — internally delegates to `validate_graph_definition` for the import + lookup phase. Compile remains where it is; the extracted callable is import + lookup only, no `builder.compile()`. This avoids the side-effect of running compile at every save.

### Backend
- **NEW** `services/error_classifier.py`:
  ```python
  class ReloadFailureCode(StrEnum):
      IMPORT_ERROR = "import_error"
      CONNECTION_ERROR = "connection_error"
      ENV_UNSET = "env_unset"
      COMPILE_ERROR = "compile_error"
      INIT_FAILED_UNKNOWN = "init_failed_unknown"

  def classify_reload_error(
      exc: BaseException,
      engine_config: EngineConfig,
  ) -> StandaloneAdminError: ...
  ```
- **CHANGED** `services/reload.py`:
  - Round 2.5 invokes `validate_graph_definition` between cross-resource validation (round 2) and engine reload (round 3).
  - Round 3 catches `ReloadInitFailed` → routes through `classify_reload_error` instead of the current flat `code=RELOAD_FAILED` envelope.
- **CHANGED** the **agent** PATCH router only — accepts `?dryRun=true` query flag, short-circuits before `commit_with_reload` when set, returns `reload.status="not_attempted"`. The other six resource routers (`memory`, `observability`, `mcp_servers`, `guardrails`, `prompts`, `integrations`) deliberately don't get the flag yet — they have no compelling save-time validation today (round 2 covers their needs). Adding the flag to them when a real call site shows up is a small follow-up per router.

### Frontend
- **CHANGED** `app/admin/agent/page.tsx` zod schema — add structural regex on `definition`:
  ```ts
  definition: z
    .string()
    .min(1, "Definition is required")
    .regex(
      /^[^\s:]+:[A-Za-z_]\w*$/,
      "Use the format `path/file.py:variable` or `module.path:variable`",
    ),
  ```
- **NEW** `hooks/use-blur-dry-run.ts` — fires the dry-run mutation **on `onBlur`** of the `definition` field (not on every keystroke). Routes errors through `applyFieldErrors` from Bundle A. No debounce, no in-flight cancellation, no race handling — when the user pauses (tabs out, clicks elsewhere, hits Save), the dry-run runs once. Same real-world UX with ~40 fewer LoC than a debounced-on-keystroke variant.

## Data flow

Live validation on field blur:

```
operator edits the definition field, then tabs/clicks out (onBlur)
       ↓
useBlurDryRun triggers PATCH /agent?dryRun=true
       ↓
backend rounds: 1 (Pydantic) → 2 (assembled config) → 2.5 (file-ref) → skip 3
       ↓
422 with field_errors      OR    200 with reload.status="not_attempted"
       ↓                                  ↓
applyFieldErrors highlights        form has no errors, save button enabled
the wrong field, no toast
```

Real save:

```
PATCH /agent
       ↓
rounds 1 → 2 → 2.5 (file-ref)
   on fail → 422 w/ field_errors[graph_definition]
   on pass → round 3 (engine reload)
              on fail → classify_reload_error → 422 w/ field_errors (best-effort) + envVar/upstream details
              on pass → 200 with reload.status="reloaded"
```

## Round-3 classifier mapping

| Exception | Code | Field path | Extras |
|---|---|---|---|
| `ImportError` | `import_error` | `agent.config.graphDefinition` | — |
| `OperationalError` / `ConnectionError` (postgres) | `connection_error` | `memory.config.dbUrl` | `details.upstream` carries the host |
| `ConnectionError` (langfuse / phoenix / langsmith) | `connection_error` | `observability.config.host` | same |
| `KeyError` for unresolved `${VAR}` | `env_unset` | (none — fake field path is worse than no field path) | `details.envVar = VAR`; top-level message describes which var |
| LangGraph compile errors (cycles, unreachable nodes) | `compile_error` | `agent.config.graphDefinition` | — |
| Anything else | `init_failed_unknown` | (none) | top-level message uses raw `str(exc)` |

## Dry-run flag pattern (agent router only)

Applied to `PATCH /admin/api/v1/agent`:

```python
@router.patch("")
async def patch_agent(
    body: AgentPatch,
    dry_run: bool = Query(default=False, alias="dryRun"),
    # ...
) -> StandaloneMutationResponse[AgentRead]:
    # rounds 1 + 2 (Pydantic + assembled config) run as today
    # + new round 2.5: graph_definition file-ref probe
    if dry_run:
        return StandaloneMutationResponse(
            data=_to_read(prospective_row),
            reload=StandaloneReloadResult(status=NOT_ATTEMPTED, message="dry run"),
        )
    # else: commit_with_reload as today
```

The other six resource routers don't get the flag yet — round 2's cross-resource validation already covers their needs, and adding the flag everywhere is overhead for endpoints with no compelling dry-run use case. Add per-router when a real call site shows up.

## Frontend regex strictness

The engine accepts both `./path/file.py:variable` AND `module.dotted.path:variable`. The structural regex below matches both without trying to fully validate; deeper checks live in the dry-run path.

```regex
^[^\s:]+:[A-Za-z_]\w*$
```

Catches the most common typo (missing colon) instantly without overstepping.

## Error handling

- `validate_graph_definition` at round 2.5: returns `GraphValidationResult(ok=False, code, message, hint?)`. Reload service maps to `field_errors=[{field: "agent.config.graphDefinition", code, message}]` and short-circuits. **Hint** rendered as a secondary line if present.
- `classify_reload_error` returns a structured `StandaloneAdminError` per the table above.
- Dry-run safety: validators must not mutate DB. The dry-run short-circuit happens explicitly before flush. Verified by integration test (DB row count unchanged before/after).

## Testing

- **Engine:** pytest unit on `validate_graph_definition` for each `GraphValidationCode` (file missing, import broken, variable not found, wrong type, happy path).
- **Backend:** pytest unit on `classify_reload_error` for each exception type → expected admin error shape. Pytest integration on the agent router for `?dryRun=true` (smoke: dry-run a known-good config returns 200 + `not_attempted`; dry-run a broken config returns 422; DB row count unchanged in both).
- **Frontend:** vitest for `useBlurDryRun` hook in isolation (mocked mutationFn): assert blur triggers exactly one mutation; second blur with unchanged value is a no-op (cache via dependency comparison). Vitest integration test on the agent page form: render the page with a mocked `api.patchAgent`, type an invalid path → blur the field → assert `form.setError` is called for `definition`.

## Engine refactor scope guard

`_load_graph_builder` currently does **import + lookup + compile**. The extraction is **import + lookup only**. Compile stays in `_load_graph_builder` itself, after the validation call. This keeps the engine init contract stable and avoids the side-effect of `builder.compile()` running at every save.

## Out of scope

- Env-var resolution check at save time (would require walking the assembled config for `${VAR}` strings before the engine runs). Round-3 classifier still surfaces `env_unset` when it actually fires.
- ADK / Haystack file-ref validators. Engine refactor exposes a callable per-framework; first PR delivers LangGraph only. ADK and Haystack land as follow-ups when their adapters are reworked.

## PR-2 sequencing note

If PR-2 grows too large during implementation, the round-3 **classifier** (`services/error_classifier.py`) is the safest piece to split into a follow-up PR — round-2.5 already catches most of the painful failures, so the flat `reload_failed` envelope remaining at round 3 is no worse than today. Ship the classifier in a small follow-up rather than letting PR-2 balloon. The engine refactor + round-2.5 invocation + dry-run flag must stay together since they're tightly coupled.

---

# Bundle C — Form Polish

## Goal

Close the visible-to-end-user gap with the deprecated manager web app — without porting features users don't actually use.

## Components

### NEW: `<AdminPageHeader>`

```tsx
type Props = {
  title: string;
  description?: string;
  docsHref?: string;
  isDirty?: boolean;
  children?: React.ReactNode;  // escape hatch for page-specific actions
};
```

Layout:
- Title + optional dirty badge ("● Unsaved changes" amber, ~`text-amber-600`) on the same line.
- Optional description below.
- Right-aligned action area: `children` slot, then optional docs icon button (Lucide `BookOpen` icon, opens `docsHref` in new tab, tooltip "Documentation").

Replaces inline `<header>` blocks across all 6 admin pages.

### INSTALL: shadcn Combobox-with-chips

Run `npx shadcn@latest add combobox` to copy the upstream Combobox primitive into `components/ui/combobox.tsx`. The primitive ships exports for `Combobox`, `ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`, `ComboboxValue`, etc., and natively supports the multi-select chips pattern we need.

Usage in guardrails fields looks like:

```tsx
<Combobox
  multiple
  value={field.value}
  onValueChange={field.onChange}
  items={[]}  // free-form input; no preset list
>
  <ComboboxChips>
    <ComboboxValue>
      {field.value.map((tag) => (
        <ComboboxChip key={tag}>{tag}</ComboboxChip>
      ))}
    </ComboboxValue>
    <ComboboxChipsInput placeholder="Add term" />
  </ComboboxChips>
</Combobox>
```

Behaviors come for free:
- Enter to commit the current input as a chip.
- X button on each chip removes it.
- Backspace on empty input removes the last chip.
- Keyboard navigation between chips.
- Accessible by default (proper ARIA roles).

What we lose vs the previously-spec'd custom TagInput:
- Comma-paste auto-split (paste `word1, word2` → 2 tags). Acceptable: users hit Enter between tags. If complaints surface, intercept the input's `onValueChange` to split commas (~5 LoC).

Net: zero new component code authored. Upstream maintenance for free.

### NEW: `useBeforeUnload(when: boolean)`

```ts
import { useEffect } from "react";

export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";  // legacy spec; required in Chrome
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
```

Coverage: tab-close / hard refresh only. Sidebar client-side navigation is not intercepted; the dirty badge in `<AdminPageHeader>` provides continuous visual signal that work is unsaved.

### DELETE: `components/admin/SaveToolbar.tsx` + `components/admin/SingletonEditor.tsx`

Both are dead code (no admin page imports them). `SaveToolbar`'s badge → owned by `<AdminPageHeader>`. `SingletonEditor`'s YAML-only approach is the opposite of where the bespoke per-field admin pages went; adopting it would be a regression. Git history preserves the patterns if a future need surfaces.

### Refactor: 6 admin pages

`agent`, `memory`, `observability`, `mcp`, `guardrails`, `prompts` adopt `<AdminPageHeader>` and call `useBeforeUnload(isDirty)` once each. `isDirty` source per page:

- Singletons (agent, memory, observability): `form.formState.isDirty`
- Collections (mcp, guardrails, prompts): existing list-equality dirty flag (`!listsEqual(working, initialList)`)

### Refactor: guardrails tag fields

Six fields move from `<Input>` + `joinList`/`splitList` helpers to the shadcn Combobox-with-chips primitive (see "INSTALL" section above):

- `banned_words`
- `pii_entities`
- `competitors`
- `expected_languages`
- `valid_topics`
- `invalid_topics`

Zod schema per field: `z.array(z.string())` instead of `z.string()`. The `joinList` / `splitList` helpers can be deleted from the page once the migration is complete.

## Docs link mapping

| Page | docsHref |
|---|---|
| `/admin/agent` | `https://docs.idunplatform.com/standalone/agent` |
| `/admin/memory` | `https://docs.idunplatform.com/standalone/memory` |
| `/admin/guardrails` | `https://docs.idunplatform.com/standalone/guardrails` |
| `/admin/mcp` | `https://docs.idunplatform.com/standalone/mcp` |
| `/admin/observability` | `https://docs.idunplatform.com/standalone/observability` |
| `/admin/prompts` | `https://docs.idunplatform.com/standalone/prompts` |

If a docs page doesn't yet exist on the live docs site, the link goes to the parent section (e.g. `/standalone/`). Operators get *some* docs target; broken-link risk is bounded.

## Error handling

- shadcn Combobox: handles trim/dedup/X-button/keyboard-nav natively. Invalid input (e.g. empty string) handled at the parent form level via zod (`z.array(z.string().min(1))`).
- `useBeforeUnload`: standard `BeforeUnloadEvent` handling with both `e.preventDefault()` and `e.returnValue = ""` for legacy Chrome compat.
- `<AdminPageHeader>`: if `docsHref` is undefined, the docs button doesn't render. No fallback href, no broken affordance.

## Testing

- **vitest for the guardrails page Combobox usage:** smoke test that field values round-trip through the form (Enter adds a tag, X removes a tag, form value mirrors the chip list). The Combobox primitive itself is upstream-tested; we only test our wiring.
- **vitest for `<AdminPageHeader>`:** renders title, conditional description, conditional docs button, conditional dirty badge.
- **vitest for `useBeforeUnload`:** registers/unregisters listener correctly with `when` toggling.
- **One refactor smoke per admin page:** assert that the `<AdminPageHeader>` is the first child of the page root.

## Out of scope

- Per-field tooltip help icons (the existing `<FormDescription>` is sufficient; if a field develops a richer help requirement later, a `<FieldHelp>` opt-in helper can land then).
- Sidebar Link wrapper for client-side nav guard. App Router doesn't expose route-change events cleanly; wrapping all sidebar `<Link>` clicks adds a Provider + context + per-page registration discipline. Beforeunload alone is the right minimum; if sidebar-loss complaints surface, `<DirtyAwareLink>` is a follow-up.
- i18n / translations.
- Mobile-responsive tweaks to AdminPageHeader (single-row layout works at all sizes; refine if a real complaint surfaces).

---

# Acceptance gates

Per child PR:
- Standalone narrowed pytest gate green (`uv run pytest libs/idun_agent_standalone/tests -m "not requires_langfuse and not requires_phoenix and not requires_postgres"`). Full suite is gated on merge to mvp, not per child PR.
- Engine narrowed pytest gate green for any engine-side change (Bundle B): same marker exclusions.
- Vitest tests green for any new components / hooks.
- `make precommit` clean (ruff, mypy, gitleaks).

Per Bundle B specifically:
- Explicit dry-run smoke test: POST a known-bad config with `?dryRun=true` → expect 422 with mapped field paths; DB row count unchanged before/after.

---

# Open follow-ups (not in scope)

These are noted so the next round of brainstorming can pick them up cleanly:

- **Sessions/traces dashboard rebuild on `/admin`** — the dashboard is currently 404 because the sessions endpoint is deferred. Bundle A's runtime_state surface goes onto `/admin/agent` instead, sidestepping this.
- **Sliding-window session renewal** — different domain; tracked separately.
- **PyPI lookup for outdated engine version** — explicitly skipped for OSS-friendliness; revisit if demand surfaces.
- **`<FieldHelp>` opt-in tooltip** — add when a real call site needs richer help content.
- **`<DirtyAwareLink>` for client-side nav** — add if sidebar-loss complaints surface.
- **Env-var resolution check at save time** — round-3 classifier surfaces `env_unset` when it fires; preflight check is harder.
- **ADK / Haystack file-ref validators** — engine refactor exposes the callable per-framework; LangGraph first.
