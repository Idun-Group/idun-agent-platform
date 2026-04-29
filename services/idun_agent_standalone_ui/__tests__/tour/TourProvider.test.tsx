import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

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
  useSearchParams: () => navigationMocks.searchParams,
}));

import { TourProvider } from "@/components/tour/TourProvider";
import { TOUR_STEPS } from "@/components/tour/tour-steps";

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
  // Some tests plant anchor stubs (data-tour="…") on document.body so
  // the provider's anchor-presence checks resolve synchronously. Wipe
  // them between tests so anchor-missing scenarios stay deterministic.
  document.body
    .querySelectorAll("[data-tour]")
    .forEach((el) => el.remove());
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

describe("TourProvider — desktop trigger", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams("tour=start");
    navigationMocks.pathname = "/";
    // Step 0 anchors on [data-tour="chat-composer"]. The provider gates
    // drive(0) on the anchor's presence (so the wizard handoff doesn't
    // race the chat composer mount in production); in JSDOM we plant
    // the anchor up-front so drive(0) fires synchronously.
    const anchor = document.createElement("div");
    anchor.setAttribute("data-tour", "chat-composer");
    document.body.appendChild(anchor);
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
    act(() => {
      config.onNextClick!(undefined, TOUR_STEPS[0], {
        driver: driverMock,
        state: { activeIndex: 0 },
      });
    });
    expect(navigationMocks.push).toHaveBeenCalledWith("/admin/agent");
    expect(driverMock.moveNext).not.toHaveBeenCalled();
  });

  it("on Next from step 1 (route /admin/agent) to step 2 (same route), calls moveNext directly", () => {
    navigationMocks.pathname = "/admin/agent";
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    // Init pushes to "/" when bootstrap pathname !== "/"; clear so we
    // can assert that onNextClick alone does NOT push.
    navigationMocks.push.mockClear();
    act(() => {
      config.onNextClick!(undefined, TOUR_STEPS[1], {
        driver: driverMock,
        state: { activeIndex: 1 },
      });
    });
    expect(driverMock.moveNext).toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("on Next from step 3 (route /admin/agent) to step 4 (no route, modal), calls moveNext directly", () => {
    navigationMocks.pathname = "/admin/agent";
    render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    act(() => {
      config.onNextClick!(undefined, TOUR_STEPS[3], {
        driver: driverMock,
        state: { activeIndex: 3 },
      });
    });
    expect(driverMock.moveNext).toHaveBeenCalled();
  });

  it("after route push, when pathname matches the pending step's route, drives that step", async () => {
    // Step 1's anchor must exist before drive(1) — the bridge effect
    // gates on the anchor's presence to avoid racing the new route's
    // mount in production. Plant the anchor up-front so the rAF poll
    // resolves on the first frame.
    const anchor = document.createElement("div");
    anchor.setAttribute("data-tour", "sidebar-agent-config");
    document.body.appendChild(anchor);
    const { rerender } = render(<TourProvider>x</TourProvider>);
    const config = driverFactory.mock.calls[0][0];
    // Click Next: push /admin/agent, set pendingStepIndex = 1.
    act(() => {
      config.onNextClick!(undefined, TOUR_STEPS[0], {
        driver: driverMock,
        state: { activeIndex: 0 },
      });
    });
    driverMock.drive.mockClear();
    // Simulate route settle.
    navigationMocks.pathname = "/admin/agent";
    act(() => {
      rerender(<TourProvider>x</TourProvider>);
    });
    // Allow rAF to fire.
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined)),
      );
    });
    expect(driverMock.drive).toHaveBeenCalledWith(1);
  });
});

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
