# Standalone MVP Review — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Resolve the 8 UI/UX + API consistency gaps per `docs/superpowers/specs/2026-04-26-standalone-mvp-review-phase3-design.md`.

**Architecture:** 4 batches of work, dispatched sequentially:
- **Batch 3A — Backend search** (P3.3): `?search=` on `/admin/api/v1/traces/sessions`. Standalone backend task, no UI dependency.
- **Batch 3B — Chat hydration on session switch** (P3.2): `useChat` resets + hydrates from `getSessionEvents`. UI-only.
- **Batch 3C — UI correctness sweep** (P3.1, P3.4, P3.5, P3.6, P3.8): login tokens, remove `patchSession`, a11y attrs, ThemeProvider wiring, shadcn drift.
- **Batch 3D — Responsive layouts** (P3.7): BrandedLayout drawer + InspectorLayout breakpoints.

---

## Batch 3A — Backend trace search

### Task P3.3 — `?search=` filter on `list_sessions`

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/admin/routers/traces.py`
- Test: `libs/idun_agent_standalone/tests/integration/traces/test_session_search.py` (new)

- [ ] **Step 1: Locate** `list_sessions` in `traces.py`. Note its current signature (likely `limit: int, offset: int`).
- [ ] **Step 2: Add `search`:**

```python
@router.get("/sessions", response_model=SessionsListResponse)
async def list_sessions(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, description="Match against session ID or title"),
):
    stmt = select(SessionRow)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            sa.func.lower(SessionRow.id).like(needle)
            | sa.func.lower(SessionRow.title).like(needle)
        )
    stmt = stmt.order_by(SessionRow.created_at.desc()).limit(limit).offset(offset)
    # ... rest unchanged
```

Use `sa` import alias if already in the file; otherwise import `from sqlalchemy import func`.

- [ ] **Step 3: Test:**

```python
@pytest.mark.asyncio
async def test_list_sessions_filters_by_search(standalone_app):
    app, sm = standalone_app
    async with sm() as session:
        for sid, title in [("alpha-1", "First chat"), ("beta-2", "Second chat"), ("gamma-3", "Alpha review")]:
            session.add(SessionRow(id=sid, title=title))
        await session.commit()

    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        r = await client.get("/admin/api/v1/traces/sessions?search=alpha")
        assert r.status_code == 200
        ids = sorted([s["id"] for s in r.json()["items"]])
        # Both "alpha-1" (id match) and "gamma-3" (title contains "Alpha") should match.
        assert ids == ["alpha-1", "gamma-3"]
```

- [ ] **Step 4: Run + commit:**

```
fix(standalone): trace session list ?search= filter on id/title (P3.3)
```

---

## Batch 3B — Chat hydration on session switch

### Task P3.2 — Reset and hydrate `useChat` on `threadId` change

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` (extend)
- Test: `services/idun_agent_standalone_ui/e2e/chat.spec.ts` (extend)

- [ ] **Step 1:** In `useChat(threadId)`, add a `useEffect([threadId])` that:
  1. Resets `messages`, `events`, `status`, `error` to initial state.
  2. Aborts any in-flight `runAgent` (`abortRef.current?.abort()`).
  3. Fires off `api.getSessionEvents(threadId)` and folds the events into messages via the same dispatch logic used for live streams.

- [ ] **Step 2:** Refactor the event-dispatch switch into a reusable function `applyEvent(setMessages, event, ctx)` so both `runAgent.onEvent` and the hydration path can use it. `ctx` carries the `latestAssistantSnapshot` ref for the snapshot-fallback.

- [ ] **Step 3:** Hydration: call `api.getSessionEvents(threadId)`. The response shape is `{events: [...], truncated: bool}` (per P2.5 work). Iterate events oldest-first, calling `applyEvent` for each. The `messages` slot reconstitutes by replaying `RUN_STARTED` / `TEXT_MESSAGE_CONTENT` / `MESSAGES_SNAPSHOT` / etc.

   For multi-run sessions, each `RUN_STARTED` should create a new assistant message slot. If the existing dispatch logic only creates a slot on `send()`, refactor so `RUN_STARTED` (or the first event of a run that has no current slot) also creates one.

- [ ] **Step 4: Vitest:**

```ts
it("resets messages when threadId changes", async () => {
  vi.mocked(runAgent).mockImplementation(async ({ onEvent }) => {
    onEvent({ type: "RUN_STARTED" } as any);
    onEvent({ type: "TEXT_MESSAGE_CONTENT", delta: "first" } as any);
    onEvent({ type: "RUN_FINISHED" } as any);
  });

  const { result, rerender } = renderHook(
    ({ tid }: { tid: string }) => useChat(tid),
    { initialProps: { tid: "t1" } }
  );
  await act(async () => { await result.current.send("hello"); });
  expect(result.current.messages.length).toBeGreaterThan(0);

  rerender({ tid: "t2" });
  // messages reset to []; hydration may run async — assert immediate reset
  expect(result.current.messages).toEqual([]);
});
```

- [ ] **Step 5: Vitest hydration test:**

```ts
it("hydrates messages from getSessionEvents on threadId change", async () => {
  vi.mocked(api.getSessionEvents).mockResolvedValue({
    events: [
      { type: "RUN_STARTED", thread_id: "t2", run_id: "r1" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "hi from t2" },
      { type: "RUN_FINISHED" },
    ],
    truncated: false,
  });
  const { result, rerender } = renderHook(
    ({ tid }: { tid: string }) => useChat(tid),
    { initialProps: { tid: "t1" } }
  );
  rerender({ tid: "t2" });
  await waitFor(() => expect(result.current.messages.some(m => m.text?.includes("hi from t2"))).toBe(true));
});
```

- [ ] **Step 6: Playwright:**

```ts
test("clicking + New clears the chat thread", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /message/i }).fill("first");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/echo: first/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /\+ New/i }).click();
  await expect(page.getByText(/echo: first/i)).toBeHidden();
  // Welcome hero should be visible again:
  await expect(page.getByRole("heading", { name: /Hello/i })).toBeVisible();
});
```

- [ ] **Step 7: Run + commit:**

```
fix(standalone-ui): useChat resets+hydrates on threadId change (P3.2)
```

---

## Batch 3C — UI correctness sweep

### Task P3.1 — Login page semantic tokens

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/login/page.tsx`

- [ ] **Step 1:** `grep -n "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/app/login/page.tsx`. Replace each with the shadcn semantic equivalent:
   - `--color-bg` → `--background` (or use Tailwind `bg-background`)
   - `--color-fg` → `--foreground` (or `text-foreground`)
   - `--color-muted` → `--muted` (or `bg-muted`, `text-muted-foreground`)
   - `--color-border` → `--border` (or `border-border`)
   - `--color-accent` → `--accent` (or `text-accent`, `bg-accent`)

   Prefer Tailwind utility classes over raw `var(--*)` references.

- [ ] **Step 2:** Run typecheck + manual visual: `pnpm dev` and visit `/login/`. Verify the form looks consistent with the rest of the editorial UI.
- [ ] **Step 3: Verify:** `grep -rn "color-bg\|color-fg\|color-muted\|color-border\|color-accent" services/idun_agent_standalone_ui/app/login/` returns no matches.

### Task P3.4 — Remove `api.patchSession`

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/api.ts`

- [ ] **Step 1:** `grep -rn "patchSession" services/idun_agent_standalone_ui/` to find call sites + the definition.
- [ ] **Step 2:** Remove the function from `api.ts`. Remove any callers (per earlier review, the new traces page already dropped its caller).
- [ ] **Step 3:** Verify: `grep -rn "patchSession" services/` returns nothing.

### Task P3.5 — Disclosure a11y

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/ReasoningPanel.tsx`
- Modify: `services/idun_agent_standalone_ui/components/chat/ToolCallRow.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/reasoning-panel.test.tsx` (extend)

- [ ] **Step 1:** In `ReasoningPanel`:
  - `const panelId = useId();`
  - Header `<button>` gets `aria-expanded={open}` and `aria-controls={panelId}`.
  - Body container gets `id={panelId}`.
- [ ] **Step 2:** Same in `ToolCallRow` for its expand/collapse button + body.
- [ ] **Step 3:** Vitest:

```ts
it("ReasoningPanel toggle has aria-expanded reflecting state", () => {
  render(<ReasoningPanel plan="P" toolCalls={[]} streaming={false} />);
  const button = screen.getByRole("button", { name: /Reasoning|Plan|Thinking|Thoughts/i });
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
});
```

### Task P3.6 — ThemeProvider runtime defaultColorScheme + pre-hydration `<style>`

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/layout.tsx`
- Modify: `services/idun_agent_standalone_ui/lib/theme-provider.tsx` (if it accepts a default)

- [ ] **Step 1:** In `app/layout.tsx`, add an inline `<script>` that runs synchronously in `<head>` BEFORE React hydrates:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      (function () {
        var cfg = window.__IDUN_CONFIG__;
        var pref = (cfg && cfg.theme && cfg.theme.defaultColorScheme) || 'system';
        var dark = pref === 'dark' ||
          (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark) document.documentElement.classList.add('dark');
      })();
    `,
  }}
/>
```

This must run AFTER the `runtime-config.js` script tag (which sets `window.__IDUN_CONFIG__`) but BEFORE the React app mounts. `next/script` with `strategy="beforeInteractive"` for the runtime-config + this inline script as a sibling.

- [ ] **Step 2:** In the `<ThemeProvider>` wrapper, derive `defaultTheme` from `window.__IDUN_CONFIG__?.theme?.defaultColorScheme`. If `next-themes` doesn't accept dynamic defaults, leave `defaultTheme="system"` and let the storage key drive — but ensure the storage key is read AFTER our pre-hydration script applies the right class.

- [ ] **Step 3:** Verify: persist `theme.defaultColorScheme = "dark"` via the admin API (or hand-edit the runtime-config), reload `/`, observe no flash.

### Task P3.8 — shadcn composition drift

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/ToolCallRow.tsx`
- Modify: `services/idun_agent_standalone_ui/components/chat/HistorySidebar.tsx`

- [ ] **Step 1:** ToolCallRow status dot — replace `<span className="bg-rose-500 ..." />` etc. with shadcn `<Badge>` or our existing `<BadgeTone>` (`info`/`success`/`warning`/`danger`/`neutral`). The status palette: error → `danger`, done → `success`, running → `warning`. The dot is a small Badge; verify the visual is still a small dot (or tasteful pill).
- [ ] **Step 2:** HistorySidebar shimmer skeletons — replace `<div className="shimmer h-12 rounded-lg" />` with `<Skeleton className="h-12 w-full" />` (shadcn Skeleton already animates).
- [ ] **Step 3:** Visual check: the chat reasoning panel and history sidebar still render correctly.

### Combined commit for Batch 3C

Five sub-changes, each landed as its own commit OR one combined commit per task. Suggested as five small commits:

```
fix(standalone-ui): login page uses semantic shadcn tokens (P3.1)
chore(standalone-ui): drop unused api.patchSession (P3.4)
fix(standalone-ui): a11y aria-expanded/aria-controls on disclosures (P3.5)
fix(standalone-ui): ThemeProvider honors runtime defaultColorScheme (P3.6)
chore(standalone-ui): replace custom shimmer/status dots with shadcn primitives (P3.8)
```

---

## Batch 3D — Responsive chat layouts

### Task P3.7 — BrandedLayout drawer + InspectorLayout breakpoints

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx`
- Modify: `services/idun_agent_standalone_ui/components/chat/InspectorLayout.tsx`
- Test: `services/idun_agent_standalone_ui/e2e/chat.spec.ts` (extend with mobile viewport)

- [ ] **Step 1:** BrandedLayout: wrap HistorySidebar in two render paths:
   - On `md+` (default): inline `<HistorySidebar />`.
   - On `<md`: render a hamburger button in the header that opens `<Sheet side="left">` containing `<HistorySidebar />`. Hamburger uses `lucide-react` `Menu` icon.

   Use Tailwind responsive classes: `<div className="hidden md:block"><HistorySidebar /></div>` for the inline case; `<div className="md:hidden">[hamburger]</div>` for the trigger.

- [ ] **Step 2:** InspectorLayout: convert the fixed `[260px_1fr_320px]` grid:
   - On `lg+`: keep the 3-column grid.
   - On `<lg`: hide the right rail (`hidden lg:flex` on the `<aside>`). Optionally hide the left rail too with the same drawer pattern as Branded.

- [ ] **Step 3: Playwright responsive test:**

```ts
test("chat usable on mobile viewport", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto("/");
  // Composer is visible:
  await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();
  // History sidebar is NOT inline (hidden):
  await expect(page.locator("aside:has-text('History')")).not.toBeVisible();
  // Hamburger trigger is visible:
  await expect(page.getByRole("button", { name: /menu|history/i })).toBeVisible();
  await ctx.close();
});
```

- [ ] **Step 4: Run + commit:**

```
fix(standalone-ui): responsive chat layouts — drawer on mobile (P3.7)
```

---

## Wrap-up

After all 4 batches:

```bash
uv run pytest libs/idun_agent_standalone/tests -q          # ≥ 108
cd services/idun_agent_standalone_ui
pnpm typecheck && pnpm test && pnpm build                  # All green
pnpm test:e2e                                              # ≥ 13
```

Push branch, mark Phase 3 review items as resolved.
