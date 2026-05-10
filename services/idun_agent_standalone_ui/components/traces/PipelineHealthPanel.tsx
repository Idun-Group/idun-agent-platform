"use client";

/**
 * Toolbar widget showing the trace pipeline's runtime stats.
 *
 * Polls `GET /admin/api/v1/traces/_health` every 5s. Shows three metrics:
 *
 *   - Queue depth (e.g. "5 / 8192")
 *   - Drop count (red when > 0; "0 dropped" otherwise)
 *   - Writer status ("Running" / "Stopped")
 *
 * Renders nothing on auth / server failure — the panel is informational
 * and we'd rather degrade silently than block the trace list. The 5s
 * interval is the minimum admissible cadence per the design KB
 * (`tasks/standalone-traces-trace-pr-09-05-2026/PLAN.md` § Task 26)
 * because every poll touches the admin DB engine to read the dialect
 * and the in-process queue snapshot.
 *
 * Selection state is owned by the parent (the trace list page); this
 * component is purely read-only — no mutations, no callbacks.
 */

import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { ApiError } from "@/lib/api/client";
import { getTraceHealth } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;

export type PipelineHealthPanelProps = {
  className?: string;
};

export function PipelineHealthPanel({ className }: PipelineHealthPanelProps) {
  const { data, isError } = useQuery({
    queryKey: ["traces", "health", "panel"],
    queryFn: getTraceHealth,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // Don't retry hard on auth failures — the panel just disappears.
    retry: (failureCount, err) => {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status >= 500) return false;
      }
      return failureCount < 1;
    },
  });

  // Silently degrade: any API error → render nothing. The trace list
  // itself surfaces real problems (and the SqliteBanner shares the
  // same query so a banner-side failure manifests there too).
  if (isError || !data) {
    return null;
  }

  const drops = data.overflowCount;
  const healthy = drops === 0 && data.writerRunning;

  return (
    <div
      role="status"
      aria-label="Trace pipeline health"
      data-testid="pipeline-health-panel"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {healthy ? (
          <CircleCheckIcon
            data-testid="pipeline-health-ok"
            className="size-3.5 text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <CircleAlertIcon
            data-testid="pipeline-health-warn"
            className="size-3.5 text-amber-600 dark:text-amber-400"
          />
        )}
        <span className="font-medium text-foreground">Trace pipeline</span>
      </span>

      <span className="flex items-center gap-1" data-testid="pipeline-queue-depth">
        <span className="text-muted-foreground">Queue:</span>
        <span className="font-mono tabular-nums text-foreground">
          {data.queueDepth.toLocaleString()} /{" "}
          {data.maxQueueSize.toLocaleString()}
        </span>
      </span>

      <span
        className={cn(
          "flex items-center gap-1",
          drops > 0 && "text-destructive",
        )}
        data-testid="pipeline-drop-count"
      >
        <span className={cn(drops > 0 ? "" : "text-muted-foreground")}>
          {drops > 0 ? "Dropped:" : "Drops:"}
        </span>
        <span
          className={cn(
            "font-mono tabular-nums",
            drops > 0 ? "font-semibold" : "text-foreground",
          )}
        >
          {drops.toLocaleString()}
        </span>
      </span>

      <span className="flex items-center gap-1" data-testid="pipeline-writer">
        <span className="text-muted-foreground">Writer:</span>
        <span
          className={cn(
            "font-medium",
            data.writerRunning
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-destructive",
          )}
        >
          {data.writerRunning ? "Running" : "Stopped"}
        </span>
      </span>
    </div>
  );
}
