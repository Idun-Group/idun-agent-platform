import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import Home from "@/app/page";

const replace = vi.fn();
// Stable router object so useEffect deps don't refire across renders.
const routerInstance = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => routerInstance,
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getAgent: vi.fn(),
    },
  };
});

vi.mock("@/components/chat/BrandedLayout", () => ({
  BrandedLayout: () => <div data-testid="branded-layout" />,
}));

vi.mock("@/components/chat/MinimalLayout", () => ({
  MinimalLayout: () => <div data-testid="minimal-layout" />,
}));

vi.mock("@/components/chat/InspectorLayout", () => ({
  InspectorLayout: () => <div data-testid="inspector-layout" />,
}));

import { api, ApiError } from "@/lib/api";

describe("Home (chat root)", () => {
  beforeEach(() => {
    replace.mockReset();
    (api.getAgent as ReturnType<typeof vi.fn>).mockReset();
  });

  it("renders chat when getAgent returns 200", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "x",
      name: "Foo",
    });
    const { findByTestId } = render(<Home />);
    await findByTestId("branded-layout");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /onboarding when getAgent returns 404", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(404, null),
    );
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("does not redirect on non-404 errors (e.g. transient 500)", async () => {
    (api.getAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(500, null),
    );
    render(<Home />);
    // Wait until the probe was invoked, then assert no redirect happened.
    await waitFor(() =>
      expect(api.getAgent as ReturnType<typeof vi.fn>).toHaveBeenCalled(),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect if unmounted before getAgent resolves", async () => {
    let resolveIt!: () => void;
    (api.getAgent as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<never>((_resolve, reject) => {
        // Reject (matches the 404 path) only after we've unmounted.
        resolveIt = () => reject(new ApiError(404, null));
      }),
    );
    const { unmount } = render(<Home />);
    unmount();
    resolveIt();
    // Yield one microtask so any leaked then/catch would have a chance to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(replace).not.toHaveBeenCalled();
  });
});
