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
  return (
    <div data-testid="latency-chart" className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="ts" tickFormatter={shortTime} fontSize={10} />
          <YAxis fontSize={10} tickFormatter={(v) => `${v}ms`} />
          <Tooltip labelFormatter={shortTime} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            name="p50"
            dataKey="p50"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            name="p95"
            dataKey="p95"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
