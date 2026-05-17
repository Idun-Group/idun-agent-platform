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
 * Display modes:
 *
 *   - **Healthy** (drops == 0 && writerRunning): collapses to a
 *     single-line green dot + "Trace pipeline · OK" label. Operators
 *     scrolling the list don't burn ~50px of vertical space on the
 *     common case (#29).
 *   - **Degraded** (drops > 0 OR writer stopped): expands to the full
 *     three-metric strip. Degraded ALWAYS wins — even if the operator
 *     manually re-collapsed during a healthy state, a fresh degraded
 *     poll re-opens the panel.
 *   - **401 (session expired)**: shows a "Session expired" pill that
 *     links to /login instead of silently disappearing (#30).
 *   - **Other errors / no data**: silent degrade as before — the panel
 *     is informational and we'd rather render nothing than a noisy
 *     yellow banner that adds no operator-actionable signal.
 *
 * The query key is shared with `SqliteBanner` (#39) so the two
 * consumers de-duplicate to a single in-flight request.
 */

import { useQuery } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { TRACE_HEALTH_QUERY_KEY, getTraceHealth } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;

export type PipelineHealthPanelProps = {
  className?: string;
};

export function PipelineHealthPanel({ className }: PipelineHealthPanelProps) {
  const { data, error, isError } = useQuery({
    queryKey: TRACE_HEALTH_QUERY_KEY,
    queryFn: getTraceHealth,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // Don't retry hard on auth failures — the panel just disappears
    // (or shows a session-expired pill in the 401 case).
    retry: (failureCount, err) => {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status >= 500) return false;
      }
      return failureCount < 1;
    },
  });

  // Operator-controlled expansion only applies on a healthy state. A
  // degraded state always wins and re-expands. The default is the
  // one-line collapsed pill; clicking it sets ``manuallyExpanded=true``;
  // clicking Hide sets it back to false. The variable was renamed from
  // ``manuallyCollapsed`` because the inverse name made every render
  // guard read as a double-negative — the prior implementation's Hide
  // button was unreachable as a result.
  const [manuallyExpanded, setManuallyExpanded] = useState(false);

  // Whether the panel is currently rendering data we already know is
  // healthy. Captured outside the conditional so the reset-on-degraded
  // effect below can depend on it without re-evaluating fetch state.
  const drops = data?.overflowCount ?? 0;
  const healthy = data ? drops === 0 && data.writerRunning : null;

  // Degraded → healthy transitions reset the operator's expand intent.
  // Without this, an operator who clicked the pill while healthy, saw
  // a degraded blip, and then returned to healthy would stay in the
  // (now-irrelevant) expanded view forever. Aligns with the SPEC line
  // "degraded ALWAYS wins" — manual expansion only applies to the
  // current healthy stretch.
  useEffect(() => {
    if (healthy === false) {
      setManuallyExpanded(false);
    }
  }, [healthy]);

  // Dedicated 401 surface so the operator gets a signpost back to
  // /login instead of an unexplained empty toolbar (#30).
  if (isError && error instanceof ApiError && error.status === 401) {
    return (
      <div
        role="status"
        aria-label="Trace pipeline health (session expired)"
        data-testid="pipeline-health-auth-pill"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-xs dark:border-amber-700/60 dark:bg-amber-950/30",
          className,
        )}
      >
        <ShieldAlertIcon className="size-3.5 text-amber-700 dark:text-amber-300" />
        <span className="font-medium text-foreground">Session expired</span>
        <span className="text-muted-foreground">
          — sign in to see pipeline health.
        </span>
        <Link
          href="/login"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // Silently degrade on other errors / unloaded — see module docs.
  if (isError || !data) {
    return null;
  }

  // Instrumentor dependency conflict / attach failure surfaces a red
  // pill that overrides the healthy/degraded display. This is the
  // signal that PR #609's follow-up adds: a pre-release langchain-core
  // (or similar) silently disables the OpenInference instrumentor, so
  // the pipeline appears healthy (writer running, queue empty) while
  // no spans actually flow. Surfaced ABOVE everything else because it
  // is the most upstream failure.
  if (
    data.instrumentorStatus &&
    data.instrumentorStatus !== "ok"
  ) {
    return (
      <div
        role="status"
        aria-label="Trace pipeline instrumentor error"
        data-testid="pipeline-health-instrumentor-error"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-1.5 text-xs dark:border-red-700/60 dark:bg-red-950/30",
          className,
        )}
      >
        <ShieldAlertIcon className="size-3.5 text-red-700 dark:text-red-300" />
        <span className="font-medium text-foreground">
          Trace instrumentor inactive
        </span>
        <span className="text-muted-foreground">
          —{" "}
          {data.instrumentorStatus === "dependency_conflict"
            ? "dependency conflict"
            : "attach failed"}
          {data.instrumentorMessage ? `: ${data.instrumentorMessage}` : ""}
        </span>
      </div>
    );
  }

  // Healthy + collapsed (default unless operator un-collapsed). Renders
  // a one-line indicator. Click expands locally; clicking Hide on the
  // expanded panel returns to this collapsed state.
  if (healthy && !manuallyExpanded) {
    return (
      <button
        type="button"
        onClick={() => setManuallyExpanded(true)}
        aria-label="Trace pipeline OK — click to expand details"
        data-testid="pipeline-health-collapsed"
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1 text-xs hover:bg-muted/40",
          className,
        )}
      >
        <CircleCheckIcon
          data-testid="pipeline-health-ok"
          className="size-3 text-emerald-600 dark:text-emerald-400"
        />
        <span className="text-muted-foreground">Trace pipeline ·</span>
        <span className="font-medium text-foreground">OK</span>
      </button>
    );
  }

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

      {healthy && manuallyExpanded ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[11px]"
          onClick={() => setManuallyExpanded(false)}
          aria-label="Collapse pipeline health"
          data-testid="pipeline-health-collapse"
        >
          Hide
        </Button>
      ) : null}
    </div>
  );
}
