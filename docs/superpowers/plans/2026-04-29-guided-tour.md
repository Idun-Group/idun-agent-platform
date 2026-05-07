# Guided Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 5-step Driver.js guided tour that fires after the onboarding wizard's "Go to chat" handoff, walks the user through chat + admin surfaces, and remembers completion in localStorage.

**Architecture:** A `TourProvider` client component mounted in `app/layout.tsx` owns in-memory tour state across SPA navigations. It listens for `?tour=start`, drives a single Driver.js instance, and bridges `router.push()` calls to step advances. Persistence is a single localStorage key (`idun.tour.completed`). Trigger contract is the `?tour=start` URL param (always fires + clears flag + strips itself). Below 768px viewport, the tour silently no-ops and marks completed.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Driver.js 1.x, Vitest + React Testing Library for unit, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-04-29-guided-tour-design.md`

---

## File map

```
services/idun_agent_standalone_ui/
├── package.json                                       # T1: add driver.js dependency
├── components/tour/
│   ├── tour-steps.ts                                  # T2: TOUR_STEPS const (NEW)
│   └── TourProvider.tsx                               # T3-T8: client component (NEW, grows incrementally) + T12: import driver.css
├── __tests__/tour/
│   ├── tour-steps.test.ts                             # T2 (NEW)
│   └── TourProvider.test.tsx                          # T3-T8 (NEW, grows)
├── app/
│   ├── layout.tsx                                     # T9: mount <TourProvider>
│   ├── onboarding/page.tsx                            # T11: onGoToChat → router.push("/?tour=start")
│   └── globals.css                                    # T12: driver.js theming overrides (append block)
├── components/chat/ChatInput.tsx                      # T10: add data-tour="chat-composer" on form
├── components/admin/AppSidebar.tsx                    # T10: add 3 data-tour attrs
├── __tests__/onboarding/page-tour-handoff.test.tsx    # T11: pin Done → ?tour=start (NEW)
└── e2e/tour.spec.ts                                   # T13: happy path + mobile-skip + replay (NEW)
```

---

## Task 1: Install Driver.js dependency

**Files:**
- Modify: `services/idun_agent_standalone_ui/package.json`

- [ ] **Step 1: Add driver.js to dependencies**

Edit `services/idun_agent_standalone_ui/package.json`. In the `"dependencies"` block, add `"driver.js": "^1.3.0"` keeping alphabetical order (between `cmdk` and `lucide-react`):

```json
"dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@monaco-editor/react": "^4.6.0",
    "@tanstack/react-query": "^5.59.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "driver.js": "^1.3.0",
    "lucide-react": "^0.453.0",
    ...
}
```

- [ ] **Step 2: Install the dependency**

Run: `cd services/idun_agent_standalone_ui && npm install`
Expected: `package-lock.json` updates, `node_modules/driver.js/` exists.

- [ ] **Step 3: Verify the import surface**

Run: `cd services/idun_agent_standalone_ui && node -e "const d = require('driver.js'); console.log(typeof d.driver);"`
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/package.json services/idun_agent_standalone_ui/package-lock.json
git commit -m "chore(standalone-ui): add driver.js dependency for guided tour"
```

---

## Task 2: Tour-steps data module

**Files:**
- Create: `services/idun_agent_standalone_ui/components/tour/tour-steps.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/tour/tour-steps.test.ts`

The 5 steps are pure data — sequence, copy, anchor selectors, route mapping. Pinning them in a unit test prevents accidental drift from the spec's locked copy.

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/__tests__/tour/tour-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "@/components/tour/tour-steps";

describe("TOUR_STEPS", () => {
  it("has exactly 5 steps", () => {
    expect(TOUR_STEPS).toHaveLength(5);
  });

  it("step 0 is the chat-composer step on /", () => {
    expect(TOUR_STEPS[0].route).toBe("/");
    expect(TOUR_STEPS[0].element).toBe('[data-tour="chat-composer"]');
    expect(TOUR_STEPS[0].popover.title).toBe("Chat");
    expect(TOUR_STEPS[0].popover.description).toBe(
      "This is where you test your agent. Send a message to confirm it is running through Idun.",
    );
  });

  it("steps 1-3 share the /admin/agent route", () => {
    expect(TOUR_STEPS[1].route).toBe("/admin/agent");
    expect(TOUR_STEPS[2].route).toBe("/admin/agent");
    expect(TOUR_STEPS[3].route).toBe("/admin/agent");
  });

  it("step 1 anchors on the sidebar Configuration item", () => {
    expect(TOUR_STEPS[1].element).toBe('[data-tour="sidebar-agent-config"]');
    expect(TOUR_STEPS[1].popover.title).toBe("Admin config");
    expect(TOUR_STEPS[1].popover.description).toBe(
      "Admin lets you inspect and manage the active config for this standalone agent.",
    );
  });

  it("step 2 anchors on the sidebar Agent group label", () => {
    expect(TOUR_STEPS[2].element).toBe('[data-tour="sidebar-agent-group"]');
    expect(TOUR_STEPS[2].popover.title).toBe("Prompts, tools, and guardrails");
    expect(TOUR_STEPS[2].popover.description).toBe(
      "When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful.",
    );
  });

  it("step 3 anchors on the sidebar Observability item", () => {
    expect(TOUR_STEPS[3].element).toBe('[data-tour="sidebar-observability"]');
    expect(TOUR_STEPS[3].popover.title).toBe("Observability");
    expect(TOUR_STEPS[3].popover.description).toBe(
      "Later, connect observability providers to follow your agent beyond local traces.",
    );
  });

  it("step 4 is a modal-only deployment step (no element, no route)", () => {
    expect(TOUR_STEPS[4].element).toBeUndefined();
    expect(TOUR_STEPS[4].route).toBeUndefined();
    expect(TOUR_STEPS[4].popover.title).toBe("Deployment");
    expect(TOUR_STEPS[4].popover.description).toContain("Docker or Cloud Run");
  });

  it("every step has non-empty title and description", () => {
    for (const step of TOUR_STEPS) {
      expect(step.popover.title.length).toBeGreaterThan(0);
      expect(step.popover.description.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/idun_agent_standalone_ui && npm test -- tour-steps`
Expected: FAIL — "Cannot find module '@/components/tour/tour-steps'"

- [ ] **Step 3: Implement the data module**

Create `services/idun_agent_standalone_ui/components/tour/tour-steps.ts`:

```ts
/**
 * Hard-coded step sequence for the guided product tour.
 *
 * Copy is lifted verbatim from the original onboarding UX spec
 * (docs/superpowers/specs/2026-04-27-idun-onboarding-ux-design.md
 * §"Guided product tour"). The original spec's "Local traces" step is
 * omitted because /traces is currently a 404 route in the standalone
 * (traces backend deferred — see services/idun_agent_standalone_ui/
 * CLAUDE.md "Half-migration state").
 *
 * Step 4 (Deployment) renders as a centered modal because there is no
 * /admin/deployment route. The popover footer carries an outbound link
 * to the deployment docs.
 */

export type TourStep = {
  /**
   * Route to navigate to before showing this step. Undefined = stay on
   * current route. Steps with `route` defined trigger a router.push() if
   * the current pathname differs.
   */
  route?: string;

  /**
   * CSS selector for the element to anchor the popover on. Undefined =
   * Driver.js renders the popover as a centered modal (used for step 4:
   * Deployment).
   */
  element?: string;

  popover: {
    title: string;
    description: string;
  };
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    route: "/",
    element: '[data-tour="chat-composer"]',
    popover: {
      title: "Chat",
      description:
        "This is where you test your agent. Send a message to confirm it is running through Idun.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-agent-config"]',
    popover: {
      title: "Admin config",
      description:
        "Admin lets you inspect and manage the active config for this standalone agent.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-agent-group"]',
    popover: {
      title: "Prompts, tools, and guardrails",
      description:
        "When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-observability"]',
    popover: {
      title: "Observability",
      description:
        "Later, connect observability providers to follow your agent beyond local traces.",
    },
  },
  {
    popover: {
      title: "Deployment",
      description:
        "This same standalone agent can be packaged for Docker or Cloud Run when you are ready to deploy.",
    },
  },
] as const;

/**
 * Outbound link target for step 4's popover footer. Pulled out as its own
 * export so the TourProvider can render the link consistently and tests
 * can assert against it without string duplication.
 */
export const DEPLOYMENT_DOCS_URL =
  "https://docs.idunplatform.com/deployment/overview";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/idun_agent_standalone_ui && npm test -- tour-steps`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/tour-steps.ts \
        services/idun_agent_standalone_ui/__tests__/tour/tour-steps.test.ts
git commit -m "feat(standalone-ui): tour-steps data module"
```

---

## Task 3: TourProvider — no-op when no `?tour=start`

**Files:**
- Create: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

Establish the provider skeleton and the "do nothing without trigger" base case. Driver.js is mocked at module level so unit tests stay fast and deterministic.

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const driverMock = vi.hoisted(() => ({
  drive: vi.fn(),
  destroy: vi.fn(),
  moveNext: vi.fn(),
  movePrevious: vi.fn(),
  isActive: vi.fn(() => false),
}));
const driverFactory = vi.hoisted(() => vi.fn(() => driverMock));

vi.mock("driver.js", () => ({
  driver: driverFactory,
}));

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: "/",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: navigationMocks.replace,
    push: navigationMocks.push,
  }),
  usePathname: () => navigationMocks.pathname,
  useSearchParams: () => ({
    get: (key: string) => navigationMocks.searchParams.get(key),
  }),
}));

import { TourProvider } from "@/components/tour/TourProvider";

beforeEach(() => {
  driverMock.drive.mockReset();
  driverMock.destroy.mockReset();
  driverMock.moveNext.mockReset();
  driverMock.movePrevious.mockReset();
  driverMock.isActive.mockReset().mockReturnValue(false);
  driverFactory.mockReset().mockReturnValue(driverMock);
  navigationMocks.replace.mockReset();
  navigationMocks.push.mockReset();
  navigationMocks.pathname = "/";
  navigationMocks.searchParams = new URLSearchParams();
  localStorage.clear();
  // matchMedia: default to desktop. Mobile tests override per-test.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(min-width: 768px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TourProvider — no trigger", () => {
  it("does not instantiate driver.js when ?tour=start is absent", () => {
    render(<TourProvider>child</TourProvider>);
    expect(driverFactory).not.toHaveBeenCalled();
    expect(driverMock.drive).not.toHaveBeenCalled();
  });

  it("does not write to localStorage when ?tour=start is absent", () => {
    render(<TourProvider>child</TourProvider>);
    expect(localStorage.getItem("idun.tour.completed")).toBeNull();
  });

  it("renders children unchanged", () => {
    const { getByText } = render(
      <TourProvider>
        <span>visible-child</span>
      </TourProvider>,
    );
    expect(getByText("visible-child")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL — "Cannot find module '@/components/tour/TourProvider'"

- [ ] **Step 3: Implement the skeleton**

Create `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`:

```tsx
"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Mounted in app/layout.tsx — owns the in-memory state of the guided
 * product tour across SPA navigations.
 *
 * The provider is dormant until ?tour=start arrives in the URL. See
 * docs/superpowers/specs/2026-04-29-guided-tour-design.md for the full
 * contract.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tourStartedRef = useRef(false);

  useEffect(() => {
    if (searchParams.get("tour") !== "start") return;
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;
    // Trigger logic lands in Tasks 4-7. For now: idempotent no-op so the
    // provider can be mounted without firing anything.
  }, [searchParams, pathname, router]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider skeleton (no-op base case)"
```

---

## Task 4: TourProvider — mobile-skip path

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Modify: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

When `?tour=start` arrives below 768px, mark completed + strip the param + don't fire. Per Q9 A in the spec.

- [ ] **Step 1: Write the failing tests**

Append to `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx` (after the "no trigger" describe block):

```tsx
describe("TourProvider — mobile skip", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        media: "(min-width: 768px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("sets idun.tour.completed when triggered below md viewport", () => {
    render(<TourProvider>x</TourProvider>);
    expect(localStorage.getItem("idun.tour.completed")).toBe("true");
  });

  it("does NOT instantiate driver.js when triggered below md viewport", () => {
    render(<TourProvider>x</TourProvider>);
    expect(driverFactory).not.toHaveBeenCalled();
  });

  it("strips ?tour=start from the URL when triggered below md viewport", () => {
    navigationMocks.pathname = "/";
    render(<TourProvider>x</TourProvider>);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL — "expected 'true' to be 'true'" or similar (mobile-skip not implemented).

- [ ] **Step 3: Implement the mobile-skip path**

Replace the `useEffect` body in `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`:

```tsx
useEffect(() => {
  if (searchParams.get("tour") !== "start") return;
  if (tourStartedRef.current) return;
  tourStartedRef.current = true;

  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches;

  if (!isDesktop) {
    // Tour is desktop-only. Mark completed so a future desktop session
    // landing here doesn't surprise the user with a tour.
    try {
      localStorage.setItem("idun.tour.completed", "true");
    } catch {
      // Private browsing / quota — proceed silently.
    }
    router.replace(pathname);
    return;
  }

  // Desktop trigger lands in Task 5.
}, [searchParams, pathname, router]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 6 tests pass total (3 original + 3 mobile).

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider mobile-skip path"
```

---

## Task 5: TourProvider — desktop trigger, driver.drive(0), param strip, flag clear

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Modify: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

The core happy-path trigger: instantiate Driver.js, clear the completion flag, strip the URL param, push to `/` if not already there, drive(0).

- [ ] **Step 1: Write the failing tests**

Append to `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`:

```tsx
describe("TourProvider — desktop trigger", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    navigationMocks.pathname = "/";
  });

  it("instantiates driver.js and calls drive(0) on desktop trigger", () => {
    render(<TourProvider>x</TourProvider>);
    expect(driverFactory).toHaveBeenCalledTimes(1);
    expect(driverMock.drive).toHaveBeenCalledWith(0);
  });

  it("clears localStorage idun.tour.completed on trigger", () => {
    localStorage.setItem("idun.tour.completed", "true");
    render(<TourProvider>x</TourProvider>);
    expect(localStorage.getItem("idun.tour.completed")).toBeNull();
  });

  it("strips ?tour=start from the URL via router.replace", () => {
    render(<TourProvider>x</TourProvider>);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/");
  });

  it("pushes to / when triggered on a non-/ route", () => {
    navigationMocks.pathname = "/admin/agent";
    render(<TourProvider>x</TourProvider>);
    expect(navigationMocks.push).toHaveBeenCalledWith("/");
  });

  it("does not push to / when already on /", () => {
    navigationMocks.pathname = "/";
    render(<TourProvider>x</TourProvider>);
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("passes TOUR_STEPS to the driver factory config", () => {
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    expect(config.steps).toHaveLength(5);
    expect(config.steps[0].element).toBe('[data-tour="chat-composer"]');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL on the new desktop-trigger tests.

- [ ] **Step 3: Implement the desktop trigger**

Replace the entire `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx` file:

```tsx
"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { TOUR_STEPS } from "./tour-steps";

const COMPLETED_KEY = "idun.tour.completed";

function safeReadCompleted(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

function safeWriteCompleted(value: boolean): void {
  try {
    if (value) localStorage.setItem(COMPLETED_KEY, "true");
    else localStorage.removeItem(COMPLETED_KEY);
  } catch {
    // Private browsing / quota — proceed silently.
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tourStartedRef = useRef(false);
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    if (searchParams.get("tour") !== "start") return;
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;

    if (!isDesktop) {
      safeWriteCompleted(true);
      router.replace(pathname);
      return;
    }

    // Desktop path: clear flag (per Q5 A — `?tour=start` always re-fires
    // even after prior completion), strip the URL param, ensure we're on
    // the chat root before showing step 0, instantiate driver, drive(0).
    safeWriteCompleted(false);
    router.replace(pathname);
    if (pathname !== "/") {
      router.push("/");
    }

    const driverInstance = driver({
      showProgress: true,
      steps: TOUR_STEPS.map((step) => ({
        element: step.element,
        popover: {
          title: step.popover.title,
          description: step.popover.description,
        },
      })),
    });
    driverRef.current = driverInstance;
    driverInstance.drive(0);
  }, [searchParams, pathname, router]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 12 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider desktop trigger fires driver.drive(0)"
```

---

## Task 6: TourProvider — onDestroyed → flag set

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Modify: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

Wire Driver.js's `onDestroyed` callback (fires for "Done" + X + ESC + backdrop) to write the completion flag. Per Q5 A (dismiss = completed).

- [ ] **Step 1: Write the failing tests**

Append to `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`:

```tsx
describe("TourProvider — completion / dismiss", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    navigationMocks.pathname = "/";
  });

  it("sets idun.tour.completed to 'true' when onDestroyed fires", () => {
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    expect(config.onDestroyed).toBeTypeOf("function");
    config.onDestroyed!();
    expect(localStorage.getItem("idun.tour.completed")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL — `config.onDestroyed` is undefined.

- [ ] **Step 3: Wire onDestroyed**

In `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`, modify the `driver(...)` call to include `onDestroyed`:

```tsx
const driverInstance = driver({
  showProgress: true,
  steps: TOUR_STEPS.map((step) => ({
    element: step.element,
    popover: {
      title: step.popover.title,
      description: step.popover.description,
    },
  })),
  onDestroyed: () => {
    safeWriteCompleted(true);
    driverRef.current = null;
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 13 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider marks completed on dismiss/done"
```

---

## Task 7: TourProvider — cross-route advance

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Modify: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

When the user clicks "Next" on a step whose successor lives on a different route, push the new route + queue the step advance for after navigation settles. Same-route advances flow straight through to `driver.moveNext()`.

- [ ] **Step 1: Write the failing tests**

Append to `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`:

```tsx
describe("TourProvider — cross-route advance", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    navigationMocks.pathname = "/";
  });

  it("on Next from step 0 (route /) to step 1 (route /admin/agent), pushes the new route and does NOT call moveNext yet", () => {
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    // Driver.js onNextClick signature: (element, step, opts).
    // We pass the index via state.activeIndex on opts in the real call;
    // tests pass the activeIndex explicitly so behavior is deterministic.
    config.onNextClick!(undefined, TOUR_STEPS[0], {
      driver: driverMock,
      state: { activeIndex: 0 },
    });
    expect(navigationMocks.push).toHaveBeenCalledWith("/admin/agent");
    expect(driverMock.moveNext).not.toHaveBeenCalled();
  });

  it("on Next from step 1 (route /admin/agent) to step 2 (same route), calls moveNext directly", () => {
    navigationMocks.pathname = "/admin/agent";
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    config.onNextClick!(undefined, TOUR_STEPS[1], {
      driver: driverMock,
      state: { activeIndex: 1 },
    });
    expect(driverMock.moveNext).toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("on Next from step 3 (route /admin/agent) to step 4 (no route, modal), calls moveNext directly", () => {
    navigationMocks.pathname = "/admin/agent";
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    config.onNextClick!(undefined, TOUR_STEPS[3], {
      driver: driverMock,
      state: { activeIndex: 3 },
    });
    expect(driverMock.moveNext).toHaveBeenCalled();
  });

  it("after route push, when pathname matches the pending step's route, drives that step", async () => {
    const { rerender } = render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    // Click Next: push /admin/agent, set pendingStepIndex = 1.
    config.onNextClick!(undefined, TOUR_STEPS[0], {
      driver: driverMock,
      state: { activeIndex: 0 },
    });
    driverMock.drive.mockClear();
    // Simulate route settle.
    navigationMocks.pathname = "/admin/agent";
    rerender(<TourProvider>x</TourProvider>);
    // Allow rAF to fire.
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );
    expect(driverMock.drive).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL — `config.onNextClick` undefined.

- [ ] **Step 3: Implement cross-route advance**

In `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`, replace the file with the full version below (adds pendingStepIndex state and the route-settle effect):

```tsx
"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { TOUR_STEPS } from "./tour-steps";

const COMPLETED_KEY = "idun.tour.completed";

function safeReadCompleted(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

function safeWriteCompleted(value: boolean): void {
  try {
    if (value) localStorage.setItem(COMPLETED_KEY, "true");
    else localStorage.removeItem(COMPLETED_KEY);
  } catch {
    // Private browsing / quota — proceed silently.
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tourStartedRef = useRef(false);
  const driverRef = useRef<Driver | null>(null);
  const pathnameRef = useRef(pathname);
  const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);

  // Keep a ref to the latest pathname so onNextClick callbacks (created
  // once at driver instantiation time) can read the current route without
  // capturing a stale value.
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (searchParams.get("tour") !== "start") return;
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;

    if (!isDesktop) {
      safeWriteCompleted(true);
      router.replace(pathname);
      return;
    }

    safeWriteCompleted(false);
    router.replace(pathname);
    if (pathname !== "/") {
      router.push("/");
    }

    const driverInstance = driver({
      showProgress: true,
      steps: TOUR_STEPS.map((step) => ({
        element: step.element,
        popover: {
          title: step.popover.title,
          description: step.popover.description,
        },
      })),
      onNextClick: (_element, _step, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const next = TOUR_STEPS[idx + 1];
        if (!next) {
          opts.driver.moveNext();
          return;
        }
        if (next.route && next.route !== pathnameRef.current) {
          setPendingStepIndex(idx + 1);
          router.push(next.route);
          return;
        }
        opts.driver.moveNext();
      },
      onDestroyed: () => {
        safeWriteCompleted(true);
        driverRef.current = null;
      },
    });
    driverRef.current = driverInstance;
    driverInstance.drive(0);
  }, [searchParams, pathname, router]);

  // Bridge router navigation → driver.drive() once the new route's DOM
  // is available. rAF gives the new route one frame to commit before we
  // ask Driver.js to anchor on it.
  useEffect(() => {
    if (pendingStepIndex === null) return;
    const expectedRoute = TOUR_STEPS[pendingStepIndex]?.route;
    if (expectedRoute !== pathname) return;
    const handle = requestAnimationFrame(() => {
      driverRef.current?.drive(pendingStepIndex);
      setPendingStepIndex(null);
    });
    return () => cancelAnimationFrame(handle);
  }, [pathname, pendingStepIndex]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 17 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider cross-route step advance"
```

---

## Task 8: TourProvider — anchor-missing recovery

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`
- Modify: `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`

Driver.js's `onPopoverRender` hook fires before the popover is positioned. If `document.querySelector(step.element)` returns null at that point, log a warning and auto-advance so the tour doesn't freeze.

- [ ] **Step 1: Write the failing test**

Append to `services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx`:

```tsx
describe("TourProvider — anchor missing recovery", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    navigationMocks.pathname = "/";
  });

  it("on missing anchor, calls moveNext and console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    expect(config.onPopoverRender).toBeTypeOf("function");
    // Step 1 anchors on [data-tour="sidebar-agent-config"], which doesn't
    // exist in this jsdom render.
    config.onPopoverRender!(document.createElement("div"), {
      config: { steps: TOUR_STEPS as never },
      state: { activeIndex: 1 },
      driver: driverMock,
    });
    expect(driverMock.moveNext).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("anchor not found"),
    );
    warnSpy.mockRestore();
  });

  it("on present anchor, does NOT call moveNext", () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-tour", "sidebar-agent-config");
    document.body.appendChild(anchor);
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    config.onPopoverRender!(document.createElement("div"), {
      config: { steps: TOUR_STEPS as never },
      state: { activeIndex: 1 },
      driver: driverMock,
    });
    expect(driverMock.moveNext).not.toHaveBeenCalled();
    document.body.removeChild(anchor);
  });

  it("on modal-only step (no element), does NOT call moveNext even when no anchor matches", () => {
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    config.onPopoverRender!(document.createElement("div"), {
      config: { steps: TOUR_STEPS as never },
      state: { activeIndex: 4 }, // step 4 is the modal-only Deployment step
      driver: driverMock,
    });
    expect(driverMock.moveNext).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: FAIL — `config.onPopoverRender` undefined.

- [ ] **Step 3: Wire onPopoverRender**

In `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`, add `onPopoverRender` to the driver config (next to `onNextClick`):

```tsx
onPopoverRender: (_popover, opts) => {
  const idx = opts.state.activeIndex ?? 0;
  const step = TOUR_STEPS[idx];
  if (!step?.element) return; // modal-only step, nothing to anchor
  const found = document.querySelector(step.element);
  if (found) return;
  console.warn(
    `Tour: anchor not found for step ${idx} (${step.element}), advancing`,
  );
  opts.driver.moveNext();
},
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 20 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/tour/TourProvider.tsx \
        services/idun_agent_standalone_ui/__tests__/tour/TourProvider.test.tsx
git commit -m "feat(standalone-ui): TourProvider auto-advances on missing anchor"
```

---

## Task 9: Mount TourProvider in root layout

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/layout.tsx`

The provider must mount at root-layout level so its in-memory state survives SPA navigations between `/` and `/admin/agent`. Place it next to `QueryProvider`.

- [ ] **Step 1: Modify the root layout**

Edit `services/idun_agent_standalone_ui/app/layout.tsx`. Add the import + wrap children:

```tsx
import "./globals.css";
import Script from "next/script";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-client";
import { ThemeLoader } from "@/lib/theme-loader";
import { ThemeProvider } from "@/lib/theme-provider";
import { TourProvider } from "@/components/tour/TourProvider";
import { fontSans, fontSerif, fontMono } from "@/lib/fonts";

export const metadata = { title: "Idun Agent" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <head>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <Script
          id="idun-theme-prehydrate"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var cfg = window.__IDUN_CONFIG__;
    var pref = (cfg && cfg.theme && cfg.theme.defaultColorScheme) || 'system';
    var dark = pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeLoader />
          <QueryProvider>
            <TourProvider>{children}</TourProvider>
          </QueryProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd services/idun_agent_standalone_ui && npx tsc --noEmit`
Expected: no new errors. (The codebase has `ignoreBuildErrors: true` in `next.config.mjs` per `services/idun_agent_standalone_ui/CLAUDE.md`; we still confirm no NEW errors against the unchanged baseline.)

- [ ] **Step 3: Verify dev build boots**

Run: `cd services/idun_agent_standalone_ui && npm run build`
Expected: build succeeds, no runtime errors during `next build`'s static prerender.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/app/layout.tsx
git commit -m "feat(standalone-ui): mount TourProvider in root layout"
```

---

## Task 10: Add data-tour anchor attributes

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/ChatInput.tsx`
- Modify: `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`

Anchor attributes are pure structural — they don't change behavior. Validation lives in E2E (T12). For now we add them and verify they appear in the DOM.

- [ ] **Step 1: Add `data-tour="chat-composer"` to the ChatInput form**

Edit `services/idun_agent_standalone_ui/components/chat/ChatInput.tsx`. The `<form>` element starts at line 61 — add `data-tour="chat-composer"`:

```tsx
return (
  <form
    data-tour="chat-composer"
    className="relative rounded-3xl border border-border bg-card shadow-sm transition focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20"
    onSubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
```

- [ ] **Step 2: Add `data-tour` attributes to AppSidebar**

Edit `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`. Three changes:

(a) The "Agent" group's `<SidebarGroupLabel>` needs `data-tour="sidebar-agent-group"`. Locate the loop where `NAV.map((group) => …)` renders `<SidebarGroupLabel>{group.label}</SidebarGroupLabel>`. Replace that single line with:

```tsx
<SidebarGroupLabel data-tour={group.label === "Agent" ? "sidebar-agent-group" : undefined}>
  {group.label}
</SidebarGroupLabel>
```

(b) The `<SidebarMenuButton>` for the Configuration item (`href === "/admin/agent/"`) needs `data-tour="sidebar-agent-config"`. The Observability item (`href === "/admin/observability/"`) needs `data-tour="sidebar-observability"`. Inside the `{group.items.map((item) => …)}` block, change the `<SidebarMenuButton>` element:

```tsx
<SidebarMenuButton
  asChild
  isActive={isActive(pathname, item.href)}
  tooltip={item.label}
  data-tour={
    item.href === "/admin/agent/"
      ? "sidebar-agent-config"
      : item.href === "/admin/observability/"
      ? "sidebar-observability"
      : undefined
  }
>
```

(Other props on the existing `<SidebarMenuButton>` — like `asChild`, `isActive`, `tooltip` — keep their current values; show them above merely so the diff is unambiguous.)

- [ ] **Step 3: Verify typecheck**

Run: `cd services/idun_agent_standalone_ui && npx tsc --noEmit`
Expected: no new errors. `data-tour` is a valid HTML data attribute — TypeScript permits it on intrinsic elements via `React.HTMLAttributes`.

- [ ] **Step 4: Smoke-check the DOM via existing chat-input test**

Run: `cd services/idun_agent_standalone_ui && npm test -- chat-input`
Expected: PASS — the existing `chat-input.test.tsx` still renders successfully (the new attribute doesn't break anything).

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/components/chat/ChatInput.tsx \
        services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx
git commit -m "feat(standalone-ui): tour anchor data attrs on chat composer + admin sidebar"
```

---

## Task 11: Wire WizardDone CTA → `/?tour=start`

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/onboarding/page.tsx` (the actual `router.push` lives at line 181)
- Create: `services/idun_agent_standalone_ui/__tests__/onboarding/page-tour-handoff.test.tsx` (new targeted test)

Note: `WizardDone.tsx` itself is decoupled — it just calls the `onGoToChat` prop and is NOT modified. The change is one line in `app/onboarding/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `services/idun_agent_standalone_ui/__tests__/onboarding/page-tour-handoff.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OnboardingPage from "@/app/onboarding/page";

const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      scan: vi.fn(),
      createStarter: vi.fn(),
    },
  };
});

import { api } from "@/lib/api";

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("OnboardingPage — Done CTA hands off to tour", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    (api.scan as ReturnType<typeof vi.fn>).mockReset();
    (api.createStarter as ReturnType<typeof vi.fn>).mockReset();
  });

  it("Go to chat navigates to /?tour=start", async () => {
    (api.scan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: "EMPTY",
      scanResult: {
        root: "/tmp",
        detected: [],
        hasPythonFiles: false,
        hasIdunConfig: false,
        scanDurationMs: 0,
      },
    });
    (api.createStarter as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        id: "x",
        slug: "starter-agent",
        name: "Starter Agent",
        description: null,
        version: null,
        status: "draft",
        baseUrl: null,
        baseEngineConfig: {},
        createdAt: "2026-04-29T00:00:00Z",
        updatedAt: "2026-04-29T00:00:00Z",
      },
    });

    const { getByRole, findByRole } = renderWithQueryClient(<OnboardingPage />);

    // Step through wizard: pick LangGraph → confirm starter → done.
    await waitFor(() =>
      expect(getByRole("radio", { name: /langgraph/i })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("radio", { name: /langgraph/i }));
    fireEvent.click(getByRole("button", { name: /continue/i }));
    fireEvent.click(await findByRole("button", { name: /create starter/i }));

    // Done screen renders → click Go to chat.
    fireEvent.click(await findByRole("button", { name: /go to chat/i }));
    expect(push).toHaveBeenCalledWith("/?tour=start");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/idun_agent_standalone_ui && npm test -- page-tour-handoff`
Expected: FAIL — `push` called with `"/"` not `"/?tour=start"`.

- [ ] **Step 3: Modify the WizardDone usage in onboarding/page.tsx**

In `services/idun_agent_standalone_ui/app/onboarding/page.tsx` line 181, change `onGoToChat={() => router.push("/")}` to `onGoToChat={() => router.push("/?tour=start")}`:

```tsx
if (step.kind === "done") {
  return (
    <WizardDone
      agent={step.agent}
      framework={step.framework}
      mode={step.mode}
      onGoToChat={() => router.push("/?tour=start")}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/idun_agent_standalone_ui && npm test -- page-tour-handoff`
Expected: PASS.

- [ ] **Step 5: Confirm existing WizardDone unit test still passes**

Run: `cd services/idun_agent_standalone_ui && npm test -- WizardDone`
Expected: PASS — `WizardDone.test.tsx` doesn't assert the URL because the component itself doesn't navigate.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/app/onboarding/page.tsx \
        services/idun_agent_standalone_ui/__tests__/onboarding/page-tour-handoff.test.tsx
git commit -m "feat(standalone-ui): wizard Done CTA hands off to ?tour=start"
```

---

## Task 12: Driver.js theming via globals.css

**Files:**
- Modify: `services/idun_agent_standalone_ui/app/globals.css`

Append a CSS block that maps Driver.js classes to the runtime theme's CSS variables. No JS changes; pure styling.

- [ ] **Step 1: Append the override block**

Edit `services/idun_agent_standalone_ui/app/globals.css`. At the END of the file, append:

```css
/* ────────────────────────────────────────────────────────────────────
 * Driver.js theming — bind the guided tour's popover styling to the
 * runtime CSS variables so it inherits light/dark mode + custom themes
 * without per-mode duplication. Driver.js is imported by TourProvider
 * which also imports its base CSS; these declarations override that
 * baseline.
 * ──────────────────────────────────────────────────────────────────── */

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
  text-shadow: none;
}

.driver-popover-prev-btn {
  background: var(--secondary);
  color: var(--secondary-foreground);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 0.75);
  text-shadow: none;
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

- [ ] **Step 2: Add the Driver.js base CSS import to TourProvider**

The override block above relies on Driver.js's base CSS being loaded. Add the import at the top of `services/idun_agent_standalone_ui/components/tour/TourProvider.tsx`:

```tsx
"use client";

import "driver.js/dist/driver.css";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
// ... rest unchanged
```

- [ ] **Step 3: Verify build still succeeds**

Run: `cd services/idun_agent_standalone_ui && npm run build`
Expected: build succeeds; no CSS module errors.

- [ ] **Step 4: Verify TourProvider unit tests still pass**

Run: `cd services/idun_agent_standalone_ui && npm test -- TourProvider`
Expected: PASS — 20 tests still pass (CSS imports are no-ops in jsdom).

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_standalone_ui/app/globals.css \
        services/idun_agent_standalone_ui/components/tour/TourProvider.tsx
git commit -m "feat(standalone-ui): theme driver.js popovers via runtime CSS variables"
```

---

## Task 13: E2E coverage — happy path + mobile-skip + replay

**Files:**
- Create: `services/idun_agent_standalone_ui/e2e/tour.spec.ts`

Three flows in one file. Reuses the `page.route()` mocking pattern from `e2e/onboarding.spec.ts`.

- [ ] **Step 1: Write the spec file**

Create `services/idun_agent_standalone_ui/e2e/tour.spec.ts`:

```ts
import { test, expect, type Route, type Page } from "@playwright/test";

/**
 * E2E tests for the guided product tour.
 *
 * The tour fires from ?tour=start. To exercise the full flow we use
 * page.route() to mock /admin/api/v1/agent (so the chat root accepts the
 * existence of an agent and renders WelcomeHero) plus the onboarding
 * endpoints (so the wizard happy path runs without hitting the live
 * standalone backend's seeded state).
 */

async function mockAgent(page: Page) {
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "x",
        slug: "starter-agent",
        name: "Starter Agent",
        description: null,
        version: null,
        status: "draft",
        baseUrl: null,
        baseEngineConfig: {},
        createdAt: "2026-04-29T00:00:00Z",
        updatedAt: "2026-04-29T00:00:00Z",
      }),
    });
  });
}

async function mockWizardEmptyHappyPath(page: Page) {
  // Onboarding scan returns EMPTY so the user picks LangGraph → starter.
  await page.route(
    "**/admin/api/v1/onboarding/scan",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: "EMPTY",
          scanResult: {
            root: "/tmp",
            detected: [],
            hasPythonFiles: false,
            hasIdunConfig: false,
            scanDurationMs: 5,
          },
        }),
      });
    },
  );
  await page.route(
    "**/admin/api/v1/onboarding/create-starter",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "x",
            slug: "starter-agent",
            name: "Starter Agent",
            description: null,
            version: null,
            status: "draft",
            baseUrl: null,
            baseEngineConfig: {},
            createdAt: "2026-04-29T00:00:00Z",
            updatedAt: "2026-04-29T00:00:00Z",
          },
        }),
      });
    },
  );
}

test("happy path: wizard Done → tour fires, advances through 5 steps, marks completed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAgent(page);
  await mockWizardEmptyHappyPath(page);

  // Step through the wizard.
  await page.goto("/onboarding");
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();

  // Click Go to chat — assert URL transitions through ?tour=start.
  await page.getByRole("button", { name: /go to chat/i }).click();
  // The provider strips the param via router.replace — final URL is /.
  await page.waitForURL(/\/(?:\?.*)?$/, { timeout: 5_000 });

  // Step 0 popover anchored on chat composer.
  await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".driver-popover-title")).toHaveText("Chat");

  // Click Next → step 1: navigates to /admin/agent.
  await page.locator(".driver-popover-next-btn").click();
  await page.waitForURL(/\/admin\/agent\/?$/);
  await expect(page.locator(".driver-popover-title")).toHaveText("Admin config");

  // Click Next → step 2 (same route).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Prompts, tools, and guardrails",
  );

  // Click Next → step 3 (same route).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Observability");

  // Click Next → step 4 (modal-only deployment).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Deployment");

  // Click Done — popover dismisses, completion flag set.
  await page.locator(".driver-popover-done-btn").click();
  await expect(page.locator(".driver-popover")).not.toBeVisible();
  const completed = await page.evaluate(() =>
    localStorage.getItem("idun.tour.completed"),
  );
  expect(completed).toBe("true");

  // Reload the chat root — assert tour does NOT re-fire without ?tour=start.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".driver-popover")).not.toBeVisible();
});

test("mobile-skip: ?tour=start at viewport <md silently marks completed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await mockAgent(page);

  await page.goto("/?tour=start");
  await page.waitForLoadState("networkidle");

  // No popover renders.
  await expect(page.locator(".driver-popover")).toHaveCount(0);

  // Completion flag set.
  const completed = await page.evaluate(() =>
    localStorage.getItem("idun.tour.completed"),
  );
  expect(completed).toBe("true");

  // URL has been stripped of ?tour=start.
  expect(page.url()).not.toContain("tour=start");
});

test("replay: ?tour=start always fires even after prior completion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAgent(page);

  // Pre-set the completion flag — simulating a user who already finished
  // the tour once.
  await page.addInitScript(() => {
    localStorage.setItem("idun.tour.completed", "true");
  });

  await page.goto("/?tour=start");

  // Tour fires regardless of prior completion.
  await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".driver-popover-title")).toHaveText("Chat");

  // Flag has been cleared (the trigger always clears).
  const completed = await page.evaluate(() =>
    localStorage.getItem("idun.tour.completed"),
  );
  expect(completed).toBeNull();
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `cd services/idun_agent_standalone_ui && npm run test:e2e -- tour.spec.ts`
Expected: 3 tests PASS. The harness boots its own standalone via `e2e/boot-standalone.sh` (per `playwright.config.ts`), so no manual server start is needed.

- [ ] **Step 3: Verify the broader E2E suite still passes**

Run: `cd services/idun_agent_standalone_ui && npm run test:e2e`
Expected: previously-passing tests still pass; only the new `tour.spec.ts` adds tests.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_standalone_ui/e2e/tour.spec.ts
git commit -m "test(standalone-ui): E2E coverage for guided tour"
```

---

## Final acceptance check (post-merge)

After all 13 tasks land, run the full validation:

```bash
cd services/idun_agent_standalone_ui
npm test                        # vitest — should pass with 20+ new tour tests
npm run test:e2e                # playwright — happy path + mobile + replay
npm run build                   # next build — clean static export
```

Then verify against the spec's acceptance criteria
(`docs/superpowers/specs/2026-04-29-guided-tour-design.md` "Acceptance criteria"):

- [ ] Wizard "Go to chat" lands on `/` and fires step 0 within 500ms.
- [ ] All 5 steps reach their documented anchors.
- [ ] Step 4 renders centered as a modal.
- [ ] "Done" sets `localStorage["idun.tour.completed"] = "true"`.
- [ ] Subsequent navigation to `/` does not re-fire the tour.
- [ ] `/?tour=start` after completion clears the flag and re-fires.
- [ ] Below 768px, `/?tour=start` silently sets the flag and shows no popover.
- [ ] Anchor data-tour attributes render in the DOM.
- [ ] Popovers visually match the runtime theme (light + dark).
