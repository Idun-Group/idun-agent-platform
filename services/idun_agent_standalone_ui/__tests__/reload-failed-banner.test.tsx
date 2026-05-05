import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ReloadFailedBanner } from "@/components/admin/ReloadFailedBanner";
import type { RuntimeStatus } from "@/lib/api/types";

function renderWithStatus(status: RuntimeStatus | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-seed the query cache so the component renders synchronously.
  queryClient.setQueryData(["runtime-status"], status);
  return render(
    <QueryClientProvider client={queryClient}>
      <ReloadFailedBanner />
    </QueryClientProvider>,
  );
}

describe("ReloadFailedBanner", () => {
  it("renders nothing when no status row exists yet", () => {
    renderWithStatus(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when last_status is reloaded", () => {
    renderWithStatus({
      lastStatus: "reloaded",
      lastMessage: "Saved and reloaded.",
      lastError: null,
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when last_status is restart_required", () => {
    renderWithStatus({
      lastStatus: "restart_required",
      lastMessage: "Saved. Restart required to apply.",
      lastError: null,
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the banner with the error when last_status is reload_failed", () => {
    renderWithStatus({
      lastStatus: "reload_failed",
      lastMessage: "Engine reload failed; config not saved.",
      lastError: "ImportError: no module named 'app'",
      lastReloadedAt: "2026-05-05T12:00:00Z",
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/engine reload failed/i)).toBeInTheDocument();
    expect(screen.getByText(/importerror/i)).toBeInTheDocument();
  });
});
