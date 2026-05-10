import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
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
const backMock = vi.fn();
// `useSearchParams` is read-only in App Router; the production code
// reaches the URL via `router.replace`. The fake replace mutates a
// shared `URLSearchParams` instance and notifies React via a counter
// so consumers re-render with the new params on the next tick. This
// mirrors Next.js's actual behaviour closely enough for unit tests.
let mockSearchParams = new URLSearchParams();
const searchParamsListeners = new Set<() => void>();

function setSearchParams(qs: string): void {
  mockSearchParams = new URLSearchParams(qs);
  for (const fn of searchParamsListeners) fn();
}

const replaceMock = vi.fn((url: string) => {
  // Accept "?foo=bar", "?", or a relative URL — extract the query.
  const qIndex = url.indexOf("?");
  const qs = qIndex >= 0 ? url.slice(qIndex + 1) : "";
  setSearchParams(qs);
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ traceId: TRACE_ID }),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: backMock,
  }),
  useSearchParams: () => {
    const [, force] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
      const listener = () => force();
      searchParamsListeners.add(listener);
      return () => {
        searchParamsListeners.delete(listener);
      };
    }, []);
    return mockSearchParams;
  },
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
    // Use mockClear(), not mockReset(). mockReset() drops the
    // implementation we registered in `vi.fn(impl)`, which means
    // `replaceMock` records the call but never updates
    // `mockSearchParams` — and the URL state never propagates back
    // to the consumer hook. mockClear keeps the impl, just resets
    // the call-history.
    pushMock.mockClear();
    replaceMock.mockClear();
    backMock.mockClear();
    setSearchParams("");
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

  it("clicking a child span in the tree updates the detail rail (URL-stateful selection)", async () => {
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

    // Click writes ?span=<id> through router.replace; the mock fans
    // out the change to subscribers so the next render reads the new
    // URL state and the rail flips to the clicked span.
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    expect(replaceMock.mock.calls.at(-1)?.[0]).toContain("span=child-llm");

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

    // Waterfall renders each span as a keyboard-operable button; the
    // tree role disappears once the user switches to the Waterfall tab.
    await waitFor(() => {
      // The "Waterfall" tab itself is also a button -- scope to the
      // waterfall group container to avoid counting it.
      const group = screen.getByRole("group", { name: /span waterfall/i });
      expect(
        group.querySelectorAll('[role="button"][data-span-id]'),
      ).toHaveLength(3);
    });
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);

    // Selection is preserved across the view switch — same span on
    // the rail; matching button flagged via data-selected.
    expect(screen.getByTestId("span-detail-rail")).toHaveTextContent(
      "tool.search",
    );
    const selected = document.querySelector(
      '[role="button"][data-selected="true"]',
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

  // ── P3 Sub-A coverage ────────────────────────────────────────────────

  it("respects ?view=waterfall on initial render (URL-stateful view)", async () => {
    setSearchParams("view=waterfall");
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    // Waterfall renders span buttons; tree role disappears.
    await waitFor(() => {
      const group = screen.getByRole("group", { name: /span waterfall/i });
      expect(
        group.querySelectorAll('[role="button"][data-span-id]'),
      ).toHaveLength(3);
    });
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
  });

  it("respects ?span=<id> on initial render (URL-stateful selection)", async () => {
    setSearchParams("span=child-tool");
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      const rail = screen.getByTestId("span-detail-rail");
      expect(rail).toHaveTextContent("tool.search");
    });
  });

  it("falls back to root span when ?span=<id> points at a missing id", async () => {
    setSearchParams("span=does-not-exist");
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      const rail = screen.getByTestId("span-detail-rail");
      expect(rail).toHaveTextContent("root.span");
    });
  });

  it("renders the User/Session metric strip when present and skips when null", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByTestId("trace-summary-user")).toHaveTextContent(
        /User:\s*geoffrey/,
      );
    });
    expect(screen.getByTestId("trace-summary-session")).toHaveTextContent(
      /Session:\s*sess-1/,
    );
  });

  it("hides User/Session metrics when both are null", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue({
      ...TRACE_DETAIL,
      trace: { ...TRACE_DETAIL.trace, userId: null, sessionId: null },
    });

    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByText("agent.run")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("trace-summary-user")).toBeNull();
    expect(screen.queryByTestId("trace-summary-session")).toBeNull();
  });

  it("Back to traces button calls router.back() when history is available", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByTestId("trace-back-link")).toBeEnabled();
    });
    // jsdom's window.history starts with length 1; our heuristic
    // bumps it before clicking so the back path is exercised.
    window.history.pushState({}, "", "/admin/traces?model=gpt-4o");
    window.history.pushState({}, "", "/admin/traces/abc");
    expect(window.history.length).toBeGreaterThan(1);

    fireEvent.click(screen.getByTestId("trace-back-link"));
    expect(backMock).toHaveBeenCalled();
  });

  it("delete dialog shows the actual span count in the description", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getByTestId("trace-delete-button")).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId("trace-delete-button"));

    const description = await screen.findByTestId("trace-delete-description");
    // Tree has 3 spans (root + 2 children); copy must read "and its 3 spans".
    expect(description).toHaveTextContent(/its\s*3\s*spans/);
  });

  it("clicking a span writes ?span=<id> and the click is reflected via the URL", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    });

    const llmRow = screen
      .getAllByRole("treeitem")
      .find((row) => row.getAttribute("data-span-id") === "child-llm");
    fireEvent.click(llmRow!);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain("span=child-llm");
    // The `tree` view is the default — we don't write `view=tree`
    // to keep the URL clean (see writeUrlState).
    expect(lastCall).not.toContain("view=tree");
  });

  it("switching to Waterfall writes ?view=waterfall to the URL", async () => {
    vi.spyOn(tracesApi, "getTrace").mockResolvedValue(TRACE_DETAIL);
    render(withQuery(<TraceDetailPage />));

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    });

    await userEvent.setup().click(screen.getByRole("tab", { name: /waterfall/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const allCalls = replaceMock.mock.calls
      .map((c) => c[0] as string)
      .join("\n");
    expect(allCalls).toContain("view=waterfall");
  });
});
