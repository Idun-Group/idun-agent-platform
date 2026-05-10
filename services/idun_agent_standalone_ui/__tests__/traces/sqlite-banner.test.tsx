import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SqliteBanner } from "@/components/traces/SqliteBanner";
import * as tracesApi from "@/lib/api/traces";

function withQuery(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("SqliteBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the locked-copy banner when health.databaseDialect === 'sqlite'", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    });

    render(withQuery(<SqliteBanner />));

    await waitFor(() => {
      expect(screen.getByTestId("sqlite-banner")).toBeInTheDocument();
    });
    // Locked copy: do not paraphrase.
    expect(
      screen.getByText(
        /SQLite mode — for local demo only\. Performance degrades past ~10k traces\./,
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /learn more/i });
    expect(link).toHaveAttribute(
      "href",
      "/docs/quickstart#switching-to-postgres",
    );
  });

  it("renders nothing when the dialect is postgresql", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "postgresql",
    });

    const { container } = render(withQuery(<SqliteBanner />));

    await waitFor(() => {
      // Wait for the query to settle — once data is set, the banner
      // is intentionally absent.
      expect(screen.queryByTestId("sqlite-banner")).not.toBeInTheDocument();
    });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for the unknown safe-default", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 0,
      overflowCount: 0,
      writerRunning: false,
      databaseDialect: "unknown",
    });

    render(withQuery(<SqliteBanner />));

    await waitFor(() => {
      expect(screen.queryByTestId("sqlite-banner")).not.toBeInTheDocument();
    });
  });

  it("respects a custom learnMoreHref", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    });

    render(withQuery(<SqliteBanner learnMoreHref="https://example.com/docs" />));

    const link = await screen.findByRole("link", { name: /learn more/i });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });
});
