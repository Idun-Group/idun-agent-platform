import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineHealthPanel } from "@/components/traces/PipelineHealthPanel";
import { ApiError } from "@/lib/api/client";
import * as tracesApi from "@/lib/api/traces";

function withQuery(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("PipelineHealthPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses to a one-line OK indicator when healthy", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 5,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    });

    render(withQuery(<PipelineHealthPanel />));

    // Healthy state should render the collapsed indicator (#29) and
    // NOT the full three-metric strip.
    const collapsed = await screen.findByTestId(
      "pipeline-health-collapsed",
    );
    expect(collapsed).toHaveTextContent(/Trace pipeline.*OK/);
    expect(screen.getByTestId("pipeline-health-ok")).toBeInTheDocument();
    expect(
      screen.queryByTestId("pipeline-health-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pipeline-queue-depth"),
    ).not.toBeInTheDocument();
  });

  it("highlights drops in red when overflowCount > 0", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 8000,
      maxQueueSize: 8192,
      overflowCount: 12,
      writerRunning: true,
      databaseDialect: "postgresql",
    });

    render(withQuery(<PipelineHealthPanel />));

    await waitFor(() => {
      expect(screen.getByTestId("pipeline-drop-count")).toBeInTheDocument();
    });

    const drop = screen.getByTestId("pipeline-drop-count");
    expect(drop).toHaveTextContent(/Dropped:\s*12/);
    expect(drop.className).toMatch(/text-destructive/);
    // Warn icon when not healthy.
    expect(screen.getByTestId("pipeline-health-warn")).toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-health-ok")).not.toBeInTheDocument();
  });

  it("shows 'Stopped' (and warns) when writer_running is false", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: false,
      databaseDialect: "postgresql",
    });

    render(withQuery(<PipelineHealthPanel />));

    await waitFor(() => {
      expect(screen.getByTestId("pipeline-writer")).toHaveTextContent(
        "Stopped",
      );
    });
    expect(screen.getByTestId("pipeline-health-warn")).toBeInTheDocument();
  });

  it("shows a 'Session expired' pill on 401 (#30)", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockRejectedValue(
      new ApiError(401, null),
    );

    render(withQuery(<PipelineHealthPanel />));

    const pill = await screen.findByTestId("pipeline-health-auth-pill");
    expect(pill).toHaveTextContent(/Session expired/);
    // Sign-in link is rendered.
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    // The healthy / degraded surfaces stay hidden.
    expect(
      screen.queryByTestId("pipeline-health-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pipeline-health-collapsed"),
    ).not.toBeInTheDocument();
  });

  it("resets manual-expand state on a degraded transition (degraded ALWAYS wins)", async () => {
    // Operator clicks the collapsed pill while healthy → expanded.
    // Pipeline goes degraded → expanded panel renders (degraded wins).
    // Pipeline returns healthy → must collapse back to default pill, NOT
    // remain stuck in the operator's stale expand intent. Without the
    // reset effect this regresses to "expanded forever until reload."
    const healthy = {
      queueDepth: 5,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    } as const;
    const degraded = {
      queueDepth: 8000,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: false,
      databaseDialect: "sqlite",
    } as const;

    const spy = vi
      .spyOn(tracesApi, "getTraceHealth")
      .mockResolvedValue(healthy);
    const user = userEvent.setup();

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PipelineHealthPanel />
      </QueryClientProvider>,
    );

    // Healthy → collapsed pill.
    const pill = await screen.findByTestId("pipeline-health-collapsed");
    await user.click(pill);
    // Operator expanded the panel.
    expect(
      await screen.findByTestId("pipeline-health-panel"),
    ).toBeInTheDocument();

    // Pipeline goes degraded — full panel keeps rendering, but the
    // useEffect should reset the operator's expand intent.
    spy.mockResolvedValue(degraded);
    client.invalidateQueries({ queryKey: ["traces", "health"] });
    await waitFor(() => {
      expect(screen.getByTestId("pipeline-health-warn")).toBeInTheDocument();
    });

    // Pipeline returns to healthy — without the reset, the operator
    // would stay stuck in expanded mode. Assert we collapse back.
    spy.mockResolvedValue(healthy);
    client.invalidateQueries({ queryKey: ["traces", "health"] });
    await waitFor(() => {
      expect(
        screen.getByTestId("pipeline-health-collapsed"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("pipeline-health-panel"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing on a 500 (silent degrade)", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockRejectedValue(
      new ApiError(500, null),
    );

    render(withQuery(<PipelineHealthPanel />));

    await waitFor(() => {
      expect(
        screen.queryByTestId("pipeline-health-panel"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("pipeline-health-collapsed"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pipeline-health-auth-pill"),
    ).not.toBeInTheDocument();
  });

  it("surfaces a red pill when the instrumentor failed with a dependency conflict", async () => {
    // Even with a writer-running, drops-zero pipeline, an inactive
    // instrumentor means zero spans are being captured. The red pill
    // must override the healthy/degraded display so the operator
    // doesn't trust an empty trace store.
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
      instrumentorStatus: "dependency_conflict",
      instrumentorMessage:
        'requested: "langchain_core >= 0.1.0" but found: "langchain_core 1.4.0a2"',
    });

    render(withQuery(<PipelineHealthPanel />));

    const pill = await screen.findByTestId(
      "pipeline-health-instrumentor-error",
    );
    expect(pill).toHaveTextContent(/Trace instrumentor inactive/);
    expect(pill).toHaveTextContent(/dependency conflict/);
    expect(pill).toHaveTextContent(/langchain_core/);
    // Must NOT render the healthy collapsed pill alongside.
    expect(
      screen.queryByTestId("pipeline-health-collapsed"),
    ).not.toBeInTheDocument();
  });

  it("surfaces a red pill when the instrumentor attach failed for a non-conflict reason", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
      instrumentorStatus: "attach_failed",
      instrumentorMessage: "boom",
    });

    render(withQuery(<PipelineHealthPanel />));

    const pill = await screen.findByTestId(
      "pipeline-health-instrumentor-error",
    );
    expect(pill).toHaveTextContent(/attach failed/);
    expect(pill).toHaveTextContent(/boom/);
  });

  it("renders the healthy collapsed pill when instrumentorStatus is omitted (back-compat)", async () => {
    // Older backend payloads don't carry instrumentorStatus; the panel
    // should fall back to the prior healthy/degraded path without the
    // red pill being false-positive.
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 0,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    });

    render(withQuery(<PipelineHealthPanel />));

    await screen.findByTestId("pipeline-health-collapsed");
    expect(
      screen.queryByTestId("pipeline-health-instrumentor-error"),
    ).not.toBeInTheDocument();
  });
});
