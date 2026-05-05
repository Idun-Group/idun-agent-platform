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
