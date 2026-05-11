"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";
import type { DashboardResponse } from "@/lib/api/types/dashboard";

import { ConnectionCard } from "@/components/admin/ConnectionCard";
import { ConfigurationDisplay } from "@/components/admin/ConfigurationDisplay";
import {
  AgentGraphLazy,
  type AgentGraphHandle,
} from "@/components/graph/AgentGraphLazy";
import { ExportMenu } from "@/components/graph/ExportMenu";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { RequestsChart } from "@/components/dashboard/RequestsChart";
import { TopErrorsTable } from "@/components/dashboard/TopErrorsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, type DashboardRange, api } from "@/lib/api";

const VALID_RANGES: DashboardRange[] = ["1h", "24h", "7d", "30d"];

function parseRange(raw: string | null): DashboardRange {
  return VALID_RANGES.includes(raw as DashboardRange)
    ? (raw as DashboardRange)
    : "24h";
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));
  const graphRef = useRef<AgentGraphHandle | null>(null);

  const setRange = useCallback(
    (next: DashboardRange) => {
      const params = new URLSearchParams(searchParams);
      params.set("range", next);
      router.replace(`/admin?${params.toString()}`);
    },
    [router, searchParams],
  );

  const agentQuery = useQuery({
    queryKey: ["agent"],
    queryFn: api.getAgent,
  });

  const graphQuery = useQuery({
    queryKey: ["admin-agent-graph"],
    queryFn: () => api.getAgentGraph(),
    retry: (failureCount, err) => {
      if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 503)
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => api.getDashboard({ range }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const agentNotConfigured =
    agentQuery.isError &&
    agentQuery.error instanceof ApiError &&
    agentQuery.error.status === 404;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl font-medium text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Overview of your standalone agent.
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <section aria-label="Configuration" className="flex flex-col gap-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Configuration
        </p>
        {agentNotConfigured ? (
          <NoAgentConfiguredCard />
        ) : agentQuery.data ? (
          <>
            <ConnectionCard />
            <ConfigurationDisplay agent={agentQuery.data} />
            <AgentGraphCard graphRef={graphRef} graphQuery={graphQuery} agentName={agentQuery.data.name} />
          </>
        ) : (
          <Skeleton className="h-32 w-full" />
        )}
      </section>

      {!agentNotConfigured && (
        <section aria-label="Activity" className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Activity · last {range}
          </p>
          <ActivityGrid query={dashboardQuery} />
        </section>
      )}
    </div>
  );
}

function NoAgentConfiguredCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No agent configured</CardTitle>
        <CardDescription>
          Finish the onboarding wizard to start running an agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href="/onboarding/"
          className="inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background"
        >
          Start the wizard →
        </a>
      </CardContent>
    </Card>
  );
}

function AgentGraphCard({
  graphRef,
  graphQuery,
  agentName,
}: {
  graphRef: React.MutableRefObject<AgentGraphHandle | null>;
  graphQuery: UseQueryResult<AgentGraphIR, unknown>;
  agentName: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Agent graph</CardTitle>
          <CardDescription>
            A visual map of this agent&apos;s sub-agents and tools.
          </CardDescription>
        </div>
        <ExportMenu
          graphRef={graphRef}
          agentName={agentName}
          disabled={
            graphQuery.isLoading || graphQuery.isError || !graphQuery.data
          }
        />
      </CardHeader>
      <CardContent>
        {graphQuery.isLoading && (
          <div className="h-[320px] animate-pulse rounded-md bg-muted" />
        )}
        {graphQuery.isError &&
          graphQuery.error instanceof ApiError &&
          (graphQuery.error.status === 404 || graphQuery.error.status === 503) && (
            <p className="text-sm text-muted-foreground">
              {graphQuery.error.status === 503
                ? "Agent isn't ready yet. The graph will appear once the engine finishes booting."
                : "Graph view isn't available for this agent type yet."}
            </p>
          )}
        {graphQuery.isError &&
          !(
            graphQuery.error instanceof ApiError &&
            (graphQuery.error.status === 404 || graphQuery.error.status === 503)
          ) && (
            <Alert variant="destructive">
              <AlertTitle>Graph unavailable</AlertTitle>
              <AlertDescription>Try reloading the page.</AlertDescription>
            </Alert>
          )}
        {graphQuery.data && (
          <AgentGraphLazy ref={graphRef} graph={graphQuery.data} height={320} />
        )}
      </CardContent>
    </Card>
  );
}

function ActivityGrid({
  query,
}: {
  query: UseQueryResult<DashboardResponse, unknown>;
}) {
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load activity</AlertTitle>
        <AlertDescription>
          The dashboard endpoint returned an error. Try again in a moment.
        </AlertDescription>
      </Alert>
    );
  }
  const data = query.data;
  const loading = query.isLoading || !data;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Requests"
          value={loading ? undefined : data!.requests.total.toLocaleString()}
          deltaLabel={deltaLabel(data?.requests.deltaPct)}
          deltaDirection={direction(data?.requests.deltaPct)}
          loading={loading}
        />
        <KpiCard
          label="p50 / p95 latency"
          value={
            loading
              ? undefined
              : `${formatMs(data!.latency.p50Ms)} / ${formatMs(data!.latency.p95Ms)}`
          }
          deltaLabel={deltaLabel(data?.latency.p95DeltaPct, "p95")}
          deltaDirection={direction(data?.latency.p95DeltaPct, /*invert=*/ true)}
          loading={loading}
        />
        <KpiCard
          label="Error rate"
          value={loading ? undefined : `${(data!.errorRate.valuePct * 100).toFixed(2)}%`}
          deltaLabel={ppLabel(data?.errorRate.deltaPp)}
          deltaDirection={direction(data?.errorRate.deltaPp, /*invert=*/ true)}
          loading={loading}
        />
        <KpiCard
          label="Total cost"
          value={loading ? undefined : `$${data!.cost.totalUsd.toFixed(2)}`}
          deltaLabel={deltaLabel(data?.cost.deltaPct)}
          deltaDirection={direction(data?.cost.deltaPct)}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests / min</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <RequestsChart series={data!.requests.series} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latency p50 / p95</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <LatencyChart series={data!.latency.series} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top errors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <TopErrorsTable rows={data!.topErrors} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function formatMs(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}ms`;
}

function deltaLabel(value: number | null | undefined, marker?: string): string | null {
  if (value == null) return null;
  const arrow = value >= 0 ? "↑" : "↓";
  const pct = Math.abs(value * 100).toFixed(1);
  const tag = marker ? `(${marker}) ` : "";
  return `${arrow} ${pct}% ${tag}vs prior`;
}

function ppLabel(value: number | null | undefined): string | null {
  if (value == null) return null;
  const arrow = value >= 0 ? "↑" : "↓";
  const pp = Math.abs(value * 100).toFixed(2);
  return `${arrow} ${pp} pp vs prior`;
}

function direction(
  value: number | null | undefined,
  invert = false,
): "up" | "down" | "neutral" {
  if (value == null || value === 0) return "neutral";
  const positive = value > 0;
  if (invert) return positive ? "down" : "up";
  return positive ? "up" : "down";
}
