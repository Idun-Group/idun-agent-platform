import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GuardrailsPage from "@/app/admin/guardrails/page";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listGuardrails: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GuardrailsPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Guardrails tag fields", () => {
  beforeEach(() => {
    // Stub fetch as a defensive net for any code path that escapes the api mock.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the AdminPageHeader title and description", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Guardrails" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/content safety, pii detection/i),
    ).toBeInTheDocument();
  });

  it("opens the sheet and shows a chips input for banned words", async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the page to finish loading (table or empty-state appears).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add guard/i }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /add guard/i }));

    // The default guard type is ban_list, so the "Add term" chips input renders.
    const chipsInput = await screen.findByPlaceholderText(/add term/i);
    expect(chipsInput).toBeInTheDocument();
  });
});
