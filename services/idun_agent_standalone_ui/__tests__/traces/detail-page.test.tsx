import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TraceDetailPage from "@/app/admin/traces/[traceId]/TraceDetailClient";
import { ApiError } from "@/lib/api/client";
import * as tracesApi from "@/lib/api/traces";

const TRACE_ID = "0123456789abcdef0123456789abcdef";

function makeSpan(
  overrides: Partial<tracesApi.StandaloneSpanRead>,
): tracesApi.StandaloneSpanRead {
  return {
    otelSpanId: "0000000000000000",
    otelTraceId: "ffffffffffffffff",
    parentSpanId: null,
    name: "root.span",
    kind: "AGENT",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 1000,
    model: null,
    provider: null,
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: 1024,
    costUsd: 0.01,
    costBreakdown: null,
    costSource: null,
    status: "OK",
    attributes: null,
    events: null,
    ...overrides,
  };
}

const TRACE_DETAIL: tracesApi.StandaloneTraceDetail = {
  trace: {
    otelTraceId: TRACE_ID,
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
  },
  tree: [
    {
      span: makeSpan({ otelSpanId: "root", name: "root.span", kind: "AGENT" }),
      children: [
        {
          span: makeSpan({
            otelSpanId: "child-llm",
            name: "openai.chat",
            kind: "LLM",
            parentSpanId: "root",
            latencyMs: 800,
          }),
          children: [],
        },
        {
          span: makeSpan({
            otelSpanId: "child-tool",
            name: "tool.search",
            kind: "TOOL",
            parentSpanId: "root",
            latencyMs: 50,
          }),
          children: [],
        },
      ],
    },
  ],
};

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ traceId: TRACE_ID }),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

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

describe("TraceDetailPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trace summary header + tree by default + auto-selects root", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByText("agent.run")).toBeInTheDocument();
    });

    // Header summary fields render the formatted values.
    expect(screen.getByTestId("trace-summary-latency")).toHaveTextContent(
      "1.23 s",
    );
    expect(screen.getByTestId("trace-summary-tokens")).toHaveTextContent(
      "4,096",
    );
    expect(screen.getByTestId("trace-summary-cost")).toHaveTextContent(
      "$0.0123",
    );

    // Tree renders all 3 spans.
    const treeRows = screen.getAllByRole("treeitem");
    expect(treeRows).toHaveLength(3);

    // Detail rail auto-selects the root span (per `effectiveSelection`).
    const rail = screen.getByTestId("span-detail-rail");
    expect(rail).toHaveTextContent("root.span");
  });

  it("clicking a child span in the tree updates the detail rail", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    });

    const llmRow = screen
      .getAllByRole("treeitem")
      .find((row) => row.getAttribute("data-span-id") === "child-llm");
    expect(llmRow).toBeDefined();
    fireEvent.click(llmRow!);

    await waitFor(() => {
      const rail = screen.getByTestId("span-detail-rail");
      expect(rail).toHaveTextContent("openai.chat");
    });
  });

  it("switching to the waterfall view preserves the selection", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    });

    const toolRow = screen
      .getAllByRole("treeitem")
      .find((row) => row.getAttribute("data-span-id") === "child-tool");
    fireEvent.click(toolRow!);

    await waitFor(() => {
      const rail = screen.getByTestId("span-detail-rail");
      expect(rail).toHaveTextContent("tool.search");
    });

    const waterfallTab = screen.getByRole("tab", { name: /waterfall/i });
    // radix Tabs uses pointer events; userEvent dispatches them properly,
    // fireEvent.click alone is insufficient under jsdom.
    await userEvent.setup().click(waterfallTab);

    // Waterfall renders all 3 spans as listitems; tree role disappears.
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);

    // Selection is preserved across the view switch — same span on
    // the rail; matching listitem flagged via data-selected.
    expect(screen.getByTestId("span-detail-rail")).toHaveTextContent(
      "tool.search",
    );
    const selected = document.querySelector(
      '[role="listitem"][data-selected="true"]',
    );
    expect(selected?.getAttribute("data-span-id")).toBe("child-tool");
  });

  it("renders a 'not found' panel when the API returns 404", async () => {
    vi.spyOn(tracesApi, "getTrace").mockRejectedValue(new ApiError(404, null));

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByTestId("trace-detail-error")).toHaveTextContent(
        /trace not found/i,
      );
    });
  });

  it("delete button opens confirm + delete fires deleteTrace + navigates back", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    const deleteSpy = vi
      .spyOn(tracesApi, "deleteTrace")
      .mockResolvedValue({ deleted: true, deletedSpans: 3 });

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByTestId("trace-delete-button")).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId("trace-delete-button"));

    const confirm = await screen.findByTestId("trace-delete-confirm");
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(TRACE_ID);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin/traces");
    });
  });
});
