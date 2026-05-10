import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TracesPage from "@/app/admin/traces/page";
import * as tracesApi from "@/lib/api/traces";

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

function makeRow(
  overrides: Partial<tracesApi.StandaloneTraceListItem> = {},
): tracesApi.StandaloneTraceListItem {
  return {
    otelTraceId: "0123456789abcdef0123456789abcdef",
    name: "agent.run",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 1234,
    totalTokens: 4096,
    totalCostUsd: 0.0123,
    models: ["gpt-4o"],
    status: "OK",
    userId: "geoffrey",
    sessionId: "sess-1",
    tags: ["prod"],
    ...overrides,
  };
}

describe("TracesPage P2 list-view UX polish", () => {
  beforeEach(() => {
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

  it("renders the search placeholder as 'Search by name prefix'", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [makeRow()],
      nextCursor: null,
      totalEstimate: 1,
    });

    render(withQuery(<TracesPage />));

    const search = await screen.findByLabelText("Search name");
    expect(search).toHaveAttribute("placeholder", "Search by name prefix");
  });

  it("renders Status / User / Session as <Select> triggers", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [makeRow()],
      nextCursor: null,
      totalEstimate: 1,
    });

    render(withQuery(<TracesPage />));

    await waitFor(() => {
      expect(screen.getByTestId("filter-status")).toBeInTheDocument();
    });

    // Each is a combobox role (Radix Select trigger).
    expect(screen.getByTestId("filter-status")).toHaveAttribute("role", "combobox");
    expect(screen.getByTestId("filter-user")).toHaveAttribute("role", "combobox");
    expect(screen.getByTestId("filter-session")).toHaveAttribute(
      "role",
      "combobox",
    );

    // Defaults to the "(any)" placeholder text.
    expect(screen.getByTestId("filter-status")).toHaveTextContent(/Any status/);
    expect(screen.getByTestId("filter-user")).toHaveTextContent(/Any user/);
    expect(screen.getByTestId("filter-session")).toHaveTextContent(/Any session/);
  });

  it("renders an end-of-results message with the count", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [makeRow({ otelTraceId: "a".repeat(32) }), makeRow({ otelTraceId: "b".repeat(32) })],
      nextCursor: null,
      totalEstimate: 2,
    });

    render(withQuery(<TracesPage />));

    const end = await screen.findByTestId("end-of-results");
    expect(end).toHaveTextContent(/Showing 2 traces · End of results\./);
  });

  it("clears the search input and other filters on Reset", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [makeRow()],
      nextCursor: null,
      totalEstimate: 1,
    });

    render(withQuery(<TracesPage />));

    const search = (await screen.findByLabelText(
      "Search name",
    )) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "leaked" } });
    expect(search.value).toBe("leaked");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(search.value).toBe("");
    });
  });

  it("sets aria-busy on the table wrapper while loading", async () => {
    let resolveList: (
      v: tracesApi.StandaloneTraceListResponse,
    ) => void = () => {};
    vi.spyOn(tracesApi, "listTraces").mockImplementation(
      () =>
        new Promise<tracesApi.StandaloneTraceListResponse>((resolve) => {
          resolveList = resolve;
        }),
    );

    render(withQuery(<TracesPage />));

    const wrapper = await screen.findByTestId("trace-table-wrapper");
    expect(wrapper).toHaveAttribute("aria-busy", "true");

    resolveList({ items: [makeRow()], nextCursor: null, totalEstimate: 1 });
    await waitFor(() => {
      expect(wrapper).toHaveAttribute("aria-busy", "false");
    });
  });

  it("invalidates the list query when Refresh is clicked", async () => {
    const list = vi
      .spyOn(tracesApi, "listTraces")
      .mockResolvedValue({
        items: [makeRow()],
        nextCursor: null,
        totalEstimate: 1,
      });

    render(withQuery(<TracesPage />));

    // Wait for the initial fetch + render to settle so the query
    // observer is mounted before we trigger an invalidation.
    await screen.findByRole("link", { name: "agent.run" });
    expect(list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("refresh-button"));

    // Invalidation triggers a refetch on the active observer.
    await waitFor(
      () => {
        expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );
  });

  it("appends a timezone short name to the started_at column", async () => {
    vi.spyOn(tracesApi, "listTraces").mockResolvedValue({
      items: [makeRow()],
      nextCursor: null,
      totalEstimate: 1,
    });

    const { container } = render(withQuery(<TracesPage />));

    // Wait for the row to render.
    await screen.findByRole("link", { name: "agent.run" });

    // The exact short name depends on the runner's timezone, but the
    // formatted started_at will always include the year (2026) AND a
    // recognizable timezone token (`GMT±N` or a 2-5 letter abbrev).
    // Just confirm the rendered document contains both, side by side.
    expect(container.textContent).toMatch(
      /2026[^<]*?\b(?:GMT[+-]?\d+|[A-Z]{2,5})\b/,
    );
  });
});
