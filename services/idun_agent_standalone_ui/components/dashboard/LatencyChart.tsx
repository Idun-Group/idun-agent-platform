"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { LatencyBucketPoint } from "@/lib/api";

export function LatencyChart({ series }: { series: LatencyBucketPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Waiting for traffic…
      </div>
    );
  }
  const data = series.map((p) => ({ ts: p.t, p50: p.p50, p95: p.p95 }));
  const firstTs = new Date(data[0]?.ts ?? "").getTime();
  const lastTs = new Date(data[data.length - 1]?.ts ?? "").getTime();
  const includeDate =
    Number.isFinite(firstTs) &&
    Number.isFinite(lastTs) &&
    lastTs - firstTs > 24 * 60 * 60 * 1000;
  return (
    <div
      data-testid="latency-chart"
      className="h-48 w-full"
      role="img"
      aria-label="Latency over time showing p50 and p95 in milliseconds"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => formatTimestamp(String(v), includeDate)}
            fontSize={10}
          />
          <YAxis fontSize={10} tickFormatter={(v) => `${v}ms`} />
          <Tooltip
            labelFormatter={(v) => formatTimestamp(String(v), includeDate)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            name="p50"
            dataKey="p50"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 2, fill: "hsl(var(--primary))", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            name="p95"
            dataKey="p95"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={{ r: 2, fill: "hsl(var(--destructive))", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatTimestamp(iso: string, includeDate: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return includeDate
    ? d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
