# Guided Product Tour — Design

**Sub-project:** E (final piece of the onboarding UX initiative)
**Status:** approved design, ready for implementation plan
**Owner:** standalone UI
**Depends on:** sub-projects A–D (scanner, HTTP API, wizard UI, `idun-standalone init` CLI) all landed

## Goal

After a user finishes the onboarding wizard and clicks **Go to chat**, fire a 5-step Driver.js tour that walks them through the chat surface and the admin control plane. Once dismissed or completed, the tour does not auto-fire again unless the user explicitly re-triggers it via `?tour=start`.

The tour is the closing handoff in the onboarding flow:

```
folder scan → wizard → agent ready → "Go to chat" → guided tour → free use
```

It honors the original onboarding UX spec
(`docs/superpowers/specs/2026-04-27-idun-onboarding-ux-design.md` §"Guided product tour")
in step ordering and copy, with two pragmatic adjustments:

- The spec's "Local traces" step is **omitted** because `/traces` is currently a 404 route in the standalone UI (traces backend was deferred — see `services/idun_agent_standalone_ui/CLAUDE.md` "Half-migration state").
- The spec's "Deployment" step has no in-app route, so it renders as a centered modal with an outbound docs link rather than anchoring on a DOM element.

Everything else in the original spec's tour sequence carries through verbatim.

## Architecture

```
app/layout.tsx (root, server component)
  └── ThemeProvider (existing, client)
       └── QueryProvider (existing, client)
            └── TourProvider  ← NEW (client component, mounts here)
                 └── {children}  ← / or /admin/* renders here
```

`TourProvider` is the single source of truth for tour state. It mounts inside the
existing root-layout client wrappers — Next.js App Router preserves root-layout
client component state across SPA navigations, so a single in-memory
`pendingStepIndex` carries the user from chat to admin without re-instantiating
or losing position.

The tour orchestrates `router.push()` calls between steps but never owns route
rendering. The chat root and admin pages render normally regardless of tour
state. The provider lazy-instantiates one Driver.js instance per tour run, then
disposes it on completion or dismissal.

## Components and module map

```
services/idun_agent_standalone_ui/
├── app/
│   ├── layout.tsx                    # MODIFY: mount <TourProvider> next to QueryProvider
│   ├── globals.css                   # MODIFY: append driver.js theming overrides
│   └── page.tsx                      # unchanged
├── components/
│   ├── onboarding/
│   │   └── WizardDone.tsx            # MODIFY: onGoToChat → router.push("/?tour=start")
│   ├── chat/
│   │   ├── WelcomeHero.tsx           # MODIFY: add data-tour="chat-composer" anchor attr
│   │   └── ChatInput.tsx             # MODIFY: add data-tour="chat-composer" (whichever renders first)
│   ├── admin/
│   │   └── AppSidebar.tsx            # MODIFY: add data-tour attrs to sidebar items + group label
│   └── tour/                         # NEW directory
│       ├── TourProvider.tsx          # NEW: state machine + driver.js lifecycle (~120 lines)
│       └── tour-steps.ts             # NEW: hard-coded TourStep[] (pure data)
├── __tests__/tour/
│   ├── tour-steps.test.ts            # NEW: pin sequence + copy
│   └── TourProvider.test.tsx         # NEW: trigger / mobile-skip / replay / dismiss
└── e2e/
    └── tour.spec.ts                  # NEW: happy path + mobile-skip + replay
```

Driver.js is a new dev-time dependency: `npm install driver.js`. Pin to current
stable (`^1.x`).

## Data model

### `TourStep` (in `tour-steps.ts`)

```ts
export type TourStep = {
  // Route to navigate to before showing this step. Undefined = stay on
  // current route. Step 1's route is "/"; steps 2–4 are "/admin/agent";
  // step 5 has no route requirement (modal renders wherever).
  route?: string;

  // CSS selector for the element to anchor the popover on. Undefined =
  // centered modal (used for step 5: Deployment).
  element?: string;

  popover: {
    title: string;
    description: string;
  };
};
```

### `TOUR_STEPS: readonly TourStep[]`

Ordered, frozen at module load. Copy lifted verbatim from the original UX spec
where applicable.

| # | Route | Anchor selector | Title | Description |
|---|---|---|---|---|
| 0 | `/` | `[data-tour="chat-composer"]` | Chat | This is where you test your agent. Send a message to confirm it is running through Idun. |
| 1 | `/admin/agent` | `[data-tour="sidebar-agent-config"]` | Admin config | Admin lets you inspect and manage the active config for this standalone agent. |
| 2 | `/admin/agent` | `[data-tour="sidebar-agent-group"]` | Prompts, tools, and guardrails | When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful. |
| 3 | `/admin/agent` | `[data-tour="sidebar-observability"]` | Observability | Later, connect observability providers to follow your agent beyond local traces. |
| 4 | (n/a) | (none — modal) | Deployment | This same standalone agent can be packaged for Docker or Cloud Run when you are ready to deploy. (popover footer: outbound link "Read deployment guide →" → `https://docs.idunplatform.com/deployment/overview`) |

Steps 1–3 share the same route, so the tour navigates `/` → `/admin/agent`
exactly once between step 0 and step 1; steps 1→2→3 advance in place. Step 4
is a modal with no route navigation — Driver.js centers the modal regardless of
current pathname.

## State machine

`TourProvider` holds two pieces of state:

```ts
type ProviderState = {
  // Index into TOUR_STEPS. null = tour not running.
  stepIndex: number | null;

  // Tracks step index waiting for route navigation to settle. null when
  // we're not mid-navigation. Used to bridge router.push() and DOM-ready.
  pendingStepIndex: number | null;
};
```

Plus a ref to the current Driver.js instance.

### Trigger

On mount and on every `searchParams` change, `TourProvider`'s effect runs the
trigger check:

1. If `searchParams.get("tour") !== "start"` → no-op.
2. If `window.matchMedia("(min-width: 768px)").matches === false` (mobile
   viewport):
   - `localStorage.setItem("idun.tour.completed", "true")` (so it doesn't
     re-fire on a future desktop session that lands here)
   - `router.replace(pathname)` to strip the `?tour=start` param
   - return (no tour render)
3. Desktop path:
   - `localStorage.removeItem("idun.tour.completed")` (always-clear-on-trigger
     per Q5 A)
   - `router.replace(pathname)` to strip `?tour=start`
   - if `pathname !== "/"`, `router.push("/")` so the tour always starts at
     step 0
   - set `stepIndex = 0`; instantiate Driver.js with `TOUR_STEPS[0]`; call
     `driver.drive(0)`

### Step advance

Driver.js's `onNextClick` callback is wired to a provider handler:

```
const next = TOUR_STEPS[stepIndex + 1];
if (next.route && next.route !== currentPathname) {
  setPendingStepIndex(stepIndex + 1);
  router.push(next.route);
  // do NOT call driver.moveNext() — wait for route to settle
} else {
  setStepIndex(stepIndex + 1);
  driver.moveNext();
}
```

The route-settle bridge is a separate effect on `pathname`:

```
useEffect(() => {
  if (pendingStepIndex === null) return;
  if (TOUR_STEPS[pendingStepIndex].route !== pathname) return;
  // Wait one frame so the new route's DOM is committed.
  requestAnimationFrame(() => {
    setStepIndex(pendingStepIndex);
    driver.drive(pendingStepIndex);
    setPendingStepIndex(null);
  });
}, [pathname, pendingStepIndex]);
```

`onPrevClick` follows the same shape in reverse — but back nav across routes
re-uses the same provider state, so it works the same way.

### Completion / dismissal

Driver.js's `onDestroyed` callback fires for explicit "Done" (final step),
clicking the X close button, ESC key, and backdrop click. The provider handler:

```
localStorage.setItem("idun.tour.completed", "true");
setStepIndex(null);
setPendingStepIndex(null);
driverRef.current = null;
```

This collapses dismiss and complete into a single state transition (per Q5 A:
dismiss = completed).

### Anchor-missing recovery

When Driver.js attempts to render a popover and `document.querySelector(step.element)` returns `null`,
the provider's `onPopoverRender` hook intercepts:

```
console.warn(`Tour: anchor not found for step ${idx}, advancing`);
driver.moveNext();
```

Tour does not freeze; it skips the missing step. (Practical example: user
collapsed the sidebar between steps; the icon-rail variant still has the
`[data-tour]` attrs, so this is mostly a defensive guard.)

## Persistence

Single localStorage key:

- `idun.tour.completed` → `"true"` once the user completes or dismisses, or
  `"true"` immediately on mobile-skip. Cleared on every `?tour=start` trigger.

No other storage. No sessionStorage. No backend coordination. Tour is
browser-local one-shot, replay-able by re-triggering `?tour=start`.

## Trigger contract

The single entry point is the URL query param `?tour=start`. Anything that
should fire the tour appends it:

- `WizardDone.onGoToChat` → `router.push("/?tour=start")`
- Future: docs link → `<a href="/?tour=start">Take the tour</a>`
- Future: command-K item / help menu — same shape
- Developer / operator replay: paste `/?tour=start` in the URL bar

The provider always strips the param after handling, so refresh after dismiss
won't loop.

## Theming

Driver.js ships with neutral default CSS. Override classes in
`app/globals.css` to map to the runtime theme's CSS variables (`--popover`,
`--popover-foreground`, `--primary`, `--primary-foreground`, `--border`,
`--radius`, `--font-sans`, `--font-serif`):

```css
/* Driver.js theming — ride the runtime CSS variables */
.driver-popover {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-sans);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.driver-popover-title {
  font-family: var(--font-serif);
  color: var(--popover-foreground);
}
.driver-popover-description {
  color: var(--muted-foreground);
}
.driver-popover-next-btn,
.driver-popover-done-btn {
  background: var(--primary);
  color: var(--primary-foreground);
  border: 1px solid var(--primary);
  border-radius: calc(var(--radius) * 0.75);
}
.driver-popover-prev-btn {
  background: var(--secondary);
  color: var(--secondary-foreground);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 0.75);
}
.driver-popover-close-btn {
  color: var(--muted-foreground);
}
.driver-popover-progress-text {
  color: var(--muted-foreground);
}
.driver-popover-arrow {
  border-color: var(--popover);
}
```

The block is ~30 lines; covers light + dark via the CSS-variable mapping
without per-mode duplication.

## Mobile / narrow viewport behavior

The admin steps anchor on `AppSidebar` items, which are hidden below `md`
(768px) on the chat layout and behave inconsistently on the admin layout.
Sidebar-anchored popovers would render on hidden DOM or jump to wrong
positions.

**Decision (Q9 A): tour is desktop-only.**

When `?tour=start` arrives at viewport `< 768px`:

- TourProvider does NOT instantiate Driver.js
- `localStorage["idun.tour.completed"]` is set to `"true"` (so a future
  desktop session never auto-fires for an install that's already been used on
  mobile)
- The URL param is stripped
- User goes to chat normally

This is silent skip — no toast, no popover, no chrome change. The wizard's
`WizardDone` screen has already given the user the "agent is ready" success
signal; that's the mobile-acceptable end-state.

## Error handling and edge cases

| Scenario | Behavior |
|---|---|
| `?tour=start` on a non-`/` route | Strip param, `router.push("/")`, then start at step 0. |
| Below-`md` viewport when `?tour=start` arrives | No-op + `localStorage["idun.tour.completed"]="true"` + URL param stripped. |
| Anchor selector matches nothing | One-frame `rAF` retry; if still missing, `console.warn` + auto-advance. |
| User hits browser **Back** mid-tour | Tour cancels via `driver.destroy()` (route mismatch in `pendingStepIndex` effect); localStorage marked completed. |
| Two tabs both have `?tour=start` | Each tab has independent provider state. localStorage shared but flag idempotent. Acceptable concurrent runs. |
| `localStorage` unavailable (private browsing, quota) | try/catch around reads/writes. Read failure → "not completed." Write failure → warn + continue. Tour still works per session. |
| Driver.js bundle fails to load | TourProvider catches dynamic import; logs error; URL param stripped; user goes to chat. No crash. |
| User refreshes mid-tour | In-memory state lost. User lands without tour on whatever route. Replay via `?tour=start`. Documented limitation. |
| Direct nav to `/admin/agent` (no `?tour=start`) | No tour. Plain navigation. |
| Wizard reruns (agent reset → wizard re-fires → "Go to chat" again) | New `?tour=start` clears completion flag, full tour fires again. |
| Static export compatibility (`next.config.mjs` `output: "export"`) | Driver.js is client-only. Standard ES import. Compatible. |
| Sonner Toaster z-index overlap with Driver.js popover | Both use high z-index overlays. No interaction observed in practice. |

**Failure semantics:** the tour is best-effort additive UI. Any failure path
falls back to "no tour, normal app." It never blocks the chat or admin from
rendering, never throws into an error boundary, never holds a lock on
localStorage.

## Testing

### Unit tests (Vitest + React Testing Library)

`__tests__/tour/tour-steps.test.ts`:
- Total step count is 5
- Step 0 route is `/`; steps 1–3 route is `/admin/agent`; step 4 has no route
- Step 4 has no `element` (modal-only)
- Every step has non-empty `title` and non-empty `description`
- Lifted-from-spec copy matches the original UX spec verbatim (regression
  guard against accidental edits)

`__tests__/tour/TourProvider.test.tsx` (Driver.js mocked at module level via
`vi.mock("driver.js")` returning a controllable fake with `drive`, `destroy`,
`moveNext` methods + `onNextClick`/`onDestroyed` callback registry):
- `?tour=start` + desktop viewport → `driver.drive(0)` called, param stripped
  via `router.replace`, `localStorage["idun.tour.completed"]` cleared
- `?tour=start` + mobile viewport (matchMedia stubbed `matches: false`) →
  flag set to `"true"`, `drive` NOT called, param stripped
- No `?tour=start` → no-op (driver never instantiated)
- `onPopoverRender` with missing anchor → `console.warn` + `moveNext` called
- `onDestroyed` triggered → flag set to `"true"`, driver ref cleared
- Replay (flag pre-set + `?tour=start` arrives) → flag cleared, `drive(0)`
  called

`__tests__/onboarding/WizardDone.test.tsx` (extend or add): clicking
"Go to chat" calls `router.push("/?tour=start")` exactly. Regression guard.

### E2E tests (Playwright) — `e2e/tour.spec.ts`

Three flows in one file:

**Happy path:**
1. `page.goto("/onboarding")` with `page.route()` mocking
   `/admin/api/v1/onboarding/scan` → `EMPTY` and
   `/admin/api/v1/onboarding/create-starter` → success (reuse pattern from
   `e2e/onboarding.spec.ts`).
2. Click through wizard to `WizardDone`.
3. Click "Go to chat" — assert URL transitions through `/?tour=start` to `/`.
4. Assert step 0 popover visible: text contains "test your agent."
5. Click "Next" — assert URL is `/admin/agent`, step 1 popover anchored on
   sidebar Configuration item.
6. Click "Next" 3× — step 2 (Agent group), step 3 (Observability), step 4
   (Deployment modal).
7. Click "Done" — assert popover destroyed,
   `localStorage["idun.tour.completed"] === "true"`.
8. Reload page — assert no popover (tour does not re-fire without
   `?tour=start`).

**Mobile-skip flow:**
- Set viewport to 600×800.
- `page.goto("/?tour=start")`.
- Assert no popover renders within 1 second.
- Assert `localStorage["idun.tour.completed"] === "true"`.
- Assert URL is `/` (param stripped).

**Replay flow:**
- Pre-set `localStorage["idun.tour.completed"] = "true"` via
  `page.addInitScript`.
- `page.goto("/?tour=start")`.
- Assert popover for step 0 visible (tour fired despite prior completion).
- Assert localStorage value cleared (back to unset / not `"true"`).

### Out of scope for tests

- Visual snapshot of popover styling (CSS-variable theming is not asserted)
- Driver.js internals
- Cross-browser tour behavior (Playwright runs on Chromium per project config)

## Migration / rollout

No DB schema changes. No backend changes. No engine changes.

Pure frontend addition + one-line change to `WizardDone`. Ships with the next
standalone wheel. Backwards compatible: existing installs with no
`?tour=start` URL param see no tour ever, exactly as today.

## Out of scope (deferred to follow-up sub-projects)

- UI replay affordance (e.g., "Take the tour" link in admin sidebar). Per Q7 A,
  the URL param is the only entry point for v1.
- Tour analytics (which step did users dismiss on?). Would require a backend
  endpoint and trace plumbing.
- Multi-language support. Tour copy is hardcoded English; i18n comes if/when
  the rest of the standalone UI internationalizes.
- Local traces step (currently 404 backend). Returns when traces are restored.
- A full `/admin` dashboard step (currently 404 backend). Returns when
  dashboard lands.

## Acceptance criteria

- [ ] User completes wizard, clicks "Go to chat", lands on `/`, sees step 0
      popover anchored on chat composer within 500ms.
- [ ] Clicking "Next" through all 5 steps lands on the documented anchors
      and the documented route(s) at each step.
- [ ] Final step ("Deployment") renders centered as a modal with the docs
      link. Clicking the link opens the deployment docs in a new tab.
- [ ] Clicking "Done" on the final step OR dismissing via X / ESC / backdrop
      sets `localStorage["idun.tour.completed"] = "true"` and removes the
      popover.
- [ ] Subsequent navigation to `/` (without `?tour=start`) does NOT re-fire
      the tour.
- [ ] Pasting `/?tour=start` after completion clears the flag and re-fires
      the tour from step 0.
- [ ] Below 768px viewport, navigating to `/?tour=start` silently sets the
      completion flag and does not show any popover.
- [ ] Anchor data attrs (`[data-tour="…"]`) on `WelcomeHero`/`ChatInput`,
      `AppSidebar` items, and `AppSidebar` "Agent" group label render in the
      DOM and are queryable.
- [ ] Driver.js popovers visually match the runtime theme (cream background +
      ink foreground in light mode; dark variants in dark mode) without any
      hard-coded color drift.
- [ ] All unit tests + E2E flows pass.
