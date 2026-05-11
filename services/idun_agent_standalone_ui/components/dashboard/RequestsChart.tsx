"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimeBucketPoint } from "@/lib/api";

export function RequestsChart({ series }: { series: TimeBucketPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Waiting for traffic…
      </div>
    );
  }
  const data = series.map((p) => ({ ts: p.t, v: p.v }));
  const firstTs = new Date(data[0]?.ts ?? "").getTime();
  const lastTs = new Date(data[data.length - 1]?.ts ?? "").getTime();
  const includeDate =
    Number.isFinite(firstTs) &&
    Number.isFinite(lastTs) &&
    lastTs - firstTs > 24 * 60 * 60 * 1000;
  return (
    <div
      data-testid="requests-chart"
      className="h-48 w-full"
      role="img"
      aria-label="Requests per minute over time"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => formatTimestamp(String(v), includeDate)}
            fontSize={10}
          />
          <YAxis fontSize={10} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => formatTimestamp(String(v), includeDate)}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
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
