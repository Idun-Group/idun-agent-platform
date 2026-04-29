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
