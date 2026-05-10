import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TracesPage from "@/app/admin/traces/page";
import * as tracesApi from "@/lib/api/traces";

// next/link returns a plain anchor in jsdom — that's fine for the
// "row links to /admin/traces/<id>" assertion below.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function withQuery(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const SAMPLE_ROW: tracesApi.StandaloneTraceListItem = {
  otelTraceId: "0123456789abcdef0123456789abcdef",
  name: "agent.run",
  startedAt: "2026-05-09T12:00:00Z",
  endedAt: "2026-05-09T12:00:01Z",
  latencyMs: 1234,
  totalTokens: 4096,
  totalCostUsd: 0.0123,
  models: ["gpt-4o", "text-embedding-3-small"],
  status: "OK",
  userId: "geoffrey",
  sessionId: "sess-1",
  tags: ["prod"],
};

describe("TracesPage list view", () => {
  beforeEach(() => {
    // Suppress the SqliteBanner's health query — it's not the focus
    // of this test, and a default mock keeps useQuery quiet.
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 0,
      overflowCount: 0,
      writerRunning: false,
      databaseDialect: "postgresql",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders default columns + a row that links to the detail page", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [SAMPLE_ROW],
      nextCursor: null,
      totalEstimate: 1,
    });

    render(withQuery(<TracesPage />));

    // Headers — query by columnheader role to avoid clashing with the
    // filter-bar labels (e.g. the "User" filter input also has the
    // text "User").
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "Name" }),
      ).toBeInTheDocument();
    });
    ["Started", "Latency", "Tokens", "Cost", "Models", "Status"].forEach(
      (label) =>
        expect(
          screen.getByRole("columnheader", { name: label }),
        ).toBeInTheDocument(),
    );
    // User column is *not* visible by default.
    expect(screen.queryByRole("columnheader", { name: "User" })).toBeNull();

    // Row anchor → detail.
    const link = await screen.findByRole("link", { name: "agent.run" });
    expect(link).toHaveAttribute(
      "href",
      "/admin/traces/0123456789abcdef0123456789abcdef",
    );

    // Token formatting + cost formatting smoke check.
    expect(screen.getByText("4,096")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    // Model chips render.
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("renders the empty state when listTraces returns no items", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    render(withQuery(<TracesPage />));

    await waitFor(() => {
      expect(
        screen.getByText(
          /No traces yet — run an agent invocation to see traces appear here\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("re-issues the query with name_contains when the user submits the search", async () => {
    const list = vi
      .spyOn(tracesApi, "listTraces")
      .mockResolvedValue({
        items: [SAMPLE_ROW],
        nextCursor: null,
        totalEstimate: 1,
      });

    render(withQuery(<TracesPage />));

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });

    const search = screen.getByLabelText("Search name");
    fireEvent.change(search, { target: { value: "agent" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const calls = list.mock.calls.map(([f]) => f);
      expect(
        calls.some(
          (f) => (f as tracesApi.StandaloneTraceListFilters).nameContains === "agent",
        ),
      ).toBe(true);
    });
  });
});
