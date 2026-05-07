import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the mock so vi.mock can reference it before module evaluation.
const listAgentSessionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { ...actual.api, listAgentSessions: listAgentSessionsMock },
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
    listAgentSessionsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders shadcn Skeleton placeholders while loading", () => {
    // Pending promise — query stays in the loading state.
    listAgentSessionsMock.mockImplementation(() => new Promise(() => {}));

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
    // Engine-backed listing returns a bare array (no .items wrapper).
    listAgentSessionsMock.mockResolvedValue([]);

    render(
      withClient(<HistorySidebar onPick={() => {}} onNew={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
    });
  });

  it("shows the unavailable hint when canListHistory is false", () => {
    // SES.5 capability fallback: when /agent/capabilities reports the active
    // memory backend can't list sessions, the rail keeps the "+ New" pill
    // but replaces the conversation list with an inline alert. The query is
    // skipped (enabled: false), so listAgentSessions must NOT be called.
    render(
      withClient(
        <HistorySidebar
          onPick={() => {}}
          onNew={() => {}}
          canListHistory={false}
        />,
      ),
    );

    expect(screen.getByText("History not available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^\+\s*New$/ })).toBeInTheDocument();
    expect(listAgentSessionsMock).not.toHaveBeenCalled();
  });
});
