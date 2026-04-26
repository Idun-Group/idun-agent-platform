import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the mock so vi.mock can reference it before module evaluation.
const listSessionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { ...actual.api, listSessions: listSessionsMock },
  };
});

import { HistorySidebar } from "@/components/chat/HistorySidebar";

function withClient(ui: React.ReactNode) {
  // Disable retries so failed queries surface immediately in the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("HistorySidebar", () => {
  beforeEach(() => {
    listSessionsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders shadcn Skeleton placeholders while loading", () => {
    // Pending promise — query stays in the loading state.
    listSessionsMock.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      withClient(
        <HistorySidebar onPick={() => {}} onNew={() => {}} />,
      ),
    );

    expect(screen.getByText("History")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(3);
  });

  it("renders empty-state copy when no sessions exist", async () => {
    listSessionsMock.mockResolvedValue({ items: [], total: 0 });

    render(
      withClient(<HistorySidebar onPick={() => {}} onNew={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
    });
  });
});
