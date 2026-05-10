import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("renders queue depth, drop count, and Running writer when healthy", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockResolvedValue({
      queueDepth: 5,
      maxQueueSize: 8192,
      overflowCount: 0,
      writerRunning: true,
      databaseDialect: "sqlite",
    });

    render(withQuery(<PipelineHealthPanel />));

    await waitFor(() => {
      expect(screen.getByTestId("pipeline-health-panel")).toBeInTheDocument();
    });

    expect(screen.getByTestId("pipeline-queue-depth")).toHaveTextContent(
      "5 / 8,192",
    );
    expect(screen.getByTestId("pipeline-drop-count")).toHaveTextContent(
      /Drops:\s*0/,
    );
    expect(screen.getByTestId("pipeline-writer")).toHaveTextContent("Running");
    // Healthy → CircleCheck visible.
    expect(screen.getByTestId("pipeline-health-ok")).toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-health-warn")).not.toBeInTheDocument();
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

  it("renders nothing on a 401 (silent degrade)", async () => {
    vi.spyOn(tracesApi, "getTraceHealth").mockRejectedValue(
      new ApiError(401, null),
    );

    const { container } = render(withQuery(<PipelineHealthPanel />));

    await waitFor(() => {
      expect(
        screen.queryByTestId("pipeline-health-panel"),
      ).not.toBeInTheDocument();
    });
    expect(container.firstChild).toBeNull();
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
  });
});
