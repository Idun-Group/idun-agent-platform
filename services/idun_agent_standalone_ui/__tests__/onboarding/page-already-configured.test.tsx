import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OnboardingPage from "@/app/onboarding/page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => {
  const router = { replace };
  return {
    useRouter: () => router,
  };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      scan: vi.fn(),
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

describe("OnboardingPage redirect branch", () => {
  beforeEach(() => {
    replace.mockReset();
    (api.scan as ReturnType<typeof vi.fn>).mockReset();
  });

  it("redirects to / when scan returns ALREADY_CONFIGURED", async () => {
    (api.scan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: "ALREADY_CONFIGURED",
      scanResult: {
        root: "/tmp",
        detected: [],
        hasPythonFiles: false,
        hasIdunConfig: false,
        scanDurationMs: 0,
      },
      currentAgent: { id: "x", name: "Existing" },
    });
    renderWithQueryClient(<OnboardingPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("does not redirect when scan returns EMPTY", async () => {
    (api.scan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: "EMPTY",
      scanResult: {
        root: "/tmp",
        detected: [],
        hasPythonFiles: false,
        hasIdunConfig: false,
        scanDurationMs: 0,
      },
      currentAgent: null,
    });
    renderWithQueryClient(<OnboardingPage />);
    // Wait for the query to resolve and the effect to run.
    await waitFor(() => expect(api.scan).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
