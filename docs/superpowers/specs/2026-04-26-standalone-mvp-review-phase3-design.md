# Standalone MVP Review — Phase 3 (UI/UX Loose Ends) Design Spec

**Status:** Shipped — 2026-04-26

**Goal:** Address UI/UX gaps and API/product consistency issues from the 2026-04-26 review so the standalone product feels coherent end-to-end.

**Source review:** `docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md` — §"UI/UX Gaps" + §"API And Product Consistency Gaps".

**Phase 1 + 2 prerequisites:** committed and pushed (107 backend tests + 31 Vitest + 11 Playwright all green).

---

## 1. Deliverables

### 1.1 Login page semantic tokens

**Problem:** `app/login/page.tsx` still references legacy CSS vars (`--color-bg`, `--color-fg`) that A1 dropped. The first auth screen renders with invalid colors.

**Fix:** Replace every legacy var with the shadcn semantic equivalent (`--background`, `--foreground`, `--card`, `--muted`, `--border`, etc.). Use Tailwind utilities (`bg-background`, `text-foreground`) where possible.

**Acceptance:** Visual sanity check — log in screen renders identically to the rest of the editorial UI. No `--color-*` strings remain in `app/login/`.

### 1.2 Chat history resets/hydrates on session switch

**Problem:** Clicking a row in `HistorySidebar` updates `?session=...` but `useChat` owns local state and doesn't reset or hydrate. The user sees the old conversation against the new threadId.

**Fix:**
- In `useChat(threadId)`, watch `threadId` via `useEffect`. When it changes:
  1. Reset `messages` to `[]` and `events` to `[]` and `status` to `idle`.
  2. Trigger a hydration call (`api.getSessionEvents(threadId)`), reconstruct the message thread from the captured trace events (user messages + assistant responses + tool calls, all already persisted).
- The events are AG-UI events (`TEXT_MESSAGE_CONTENT`, `MESSAGES_SNAPSHOT`, `TOOL_CALL_*`, etc.). Reuse the same dispatch logic from the live `runAgent` callback to fold them into `Message[]`. Extract a shared reducer if needed.

**Acceptance:**
- New Vitest test: render `useChat`, send a message, switch `threadId` → assert messages reset.
- New Playwright E2E: open `/`, send a message, click "+ New" (creates new thread), verify chat is empty.
- Manual verify: clicking a previous session row in HistorySidebar shows that conversation.

### 1.3 Backend `?search=` filter on trace sessions

**Problem:** `api.listSessions({ search })` is wired in the UI; the search input on `/traces/` is functional in the DOM. But the backend `list_sessions` route ignores `?search=`. The UI implies it works.

**Fix:** Add a `search: str | None = Query(None)` parameter to `list_sessions` in `admin/routers/traces.py`. Filter on:
- `SessionRow.id` ILIKE `%{search}%`
- `SessionRow.title` ILIKE `%{search}%`
- (Optional) Join `TraceEventRow.payload` text-search if SQLite/Postgres support it cleanly.

Use case-insensitive match. Use SQLAlchemy `func.lower(...).like(needle)` for portability.

**Acceptance:**
- Backend test: seed 3 sessions (`alpha`, `beta`, `gamma` with various titles), call `?search=al` → returns only `alpha`.
- E2E: type "alp" in the traces search → table filters to alpha-prefixed sessions.

### 1.4 Remove unused `api.patchSession`

**Problem:** Frontend has `api.patchSession` but no backend endpoint exists. Misleading API surface.

**Fix:** Remove `patchSession` from `lib/api.ts` and any UI references. (Earlier search showed the new traces page already dropped its caller; this is just code-cleanup.)

**Acceptance:** `grep -rn "patchSession" services/` returns no matches.

### 1.5 Disclosure a11y on ReasoningPanel + ToolCallRow

**Problem:** Custom collapsibles don't expose `aria-expanded` / `aria-controls` to assistive tech.

**Fix:**
- ReasoningPanel: header button gets `aria-expanded={open}`, `aria-controls="<panel-id>"`. Body element gets `id="<panel-id>"`.
- ToolCallRow: same pattern for the row's expand/collapse button.
- Generate stable IDs via `useId()` from React.

**Acceptance:** axe-style assertion in Vitest (or inline `getByRole("button")` + `expect(button).toHaveAttribute("aria-expanded", "false")`).

### 1.6 ThemeProvider honors runtime `defaultColorScheme`

**Problem:** `<ThemeProvider attribute="class" defaultTheme="system">` is hard-coded. Runtime theme's `defaultColorScheme` is ignored on first paint.

**Fix:**
- Read `getRuntimeConfig().theme.defaultColorScheme` at the layout level (synchronously from `window.__IDUN_CONFIG__`).
- Pass it as `defaultTheme={runtimeDefault ?? "system"}` to `ThemeProvider`.
- Inline a pre-hydration `<style>` in `app/layout.tsx` `<head>` that sets the right `:root` palette based on `runtimeDefault` + `prefers-color-scheme`. Avoids first-paint flash for the chosen scheme.

**Acceptance:** A theme persisted with `defaultColorScheme: "dark"` boots into dark mode without a flash.

### 1.7 Responsive chat layouts

**Problem:**
- `BrandedLayout` always renders the 300-px HistorySidebar — unusable on mobile.
- `InspectorLayout` uses fixed `[260px_1fr_320px]` — breaks under ~900px.

**Fix:**
- BrandedLayout: render HistorySidebar inline on `md+`. On `<md`, render a hamburger button in the chat header that opens HistorySidebar in a `Sheet` (left side).
- InspectorLayout: keep 3 columns on `lg+`. On `<lg`, hide the right rail (or make it a Sheet from the right). Optional: collapse the left rail to a hamburger Sheet just like Branded.

**Acceptance:**
- Manual viewport test at 375 / 768 / 1024 / 1440 widths.
- Add Playwright responsive snapshot at 375px and 1024px (just the chat path; assert composer is visible and not crowded).

### 1.8 shadcn composition drift cleanup

**Problem:** Some hand-rolled patterns where shadcn primitives fit better.

**Fix:**
- `ToolCallRow` status dot → use shadcn `Badge` variants (`default`/`secondary`/`destructive`) or `BadgeTone` (`info`/`success`/`warning`/`danger`).
- `HistorySidebar` shimmer skeletons → use shadcn `<Skeleton>`.
- Other obvious wins: `Separator` instead of `<div className="hairline" />` where appropriate (keep `.hairline` for the chat header where the gradient is the design intent).

**Acceptance:** Visual parity, fewer custom CSS classes.

---

## 2. Architecture decisions

**D1: Chat history hydration replays events client-side.** No new backend endpoint — `getSessionEvents(sid)` already returns events; the same `useChat` reducer logic folds them into `Message[]`. Avoids a server-side `getMessages(sid)` endpoint that would double the storage model.

**D2: Trace search is SQL ILIKE on session ID + title.** Cheap, ships now. Full-text search over event payloads is deferred to a later phase (it's a much bigger lift — needs a search index, ranking, etc.).

**D3: Pre-hydration theme `<style>` is inline.** Reading `window.__IDUN_CONFIG__` runs after the static export's HTML; we add an inline script that flips `<html class="dark">` based on `(runtimeDefault, prefers-color-scheme)` BEFORE React hydrates. This is the standard `next-themes` pattern but driven by our runtime config, not localStorage.

**D4: Responsive breakpoints follow Tailwind defaults.** `md = 768`, `lg = 1024`. HistorySidebar drawer on `<md`. Inspector rail hides on `<lg`.

**D5: Disclosure IDs use `useId()`.** Stable across server-render/hydrate, no collision with sibling components.

---

## 3. Verification

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform

# Backend
uv run pytest libs/idun_agent_standalone/tests -q
# Expect: 107 + 1 (trace search test) = 108

# Frontend
cd services/idun_agent_standalone_ui
pnpm typecheck && pnpm test && pnpm build
# Expect: 31 + N (history-switch + a11y) Vitest tests; build clean

# E2E
pnpm test:e2e
# Expect: 11 + 2 (history-switch + responsive) Playwright tests
```

---

## 4. Out of scope (Phase 4+)

- Docs glossary
- FAQ split
- CONTRIBUTING
- Release smoke checklist
- All pure-polish (Phase 5)

---

## 5. Acceptance criteria

- All 8 UI/UX gaps resolved per §1.
- `grep -rn "patchSession\|--color-bg\|--color-fg" services/idun_agent_standalone_ui/` returns no matches.
- Backend + Vitest + E2E green.
- Manual viewport check at 375 / 768 / 1024 / 1440 confirms the chat is usable.
