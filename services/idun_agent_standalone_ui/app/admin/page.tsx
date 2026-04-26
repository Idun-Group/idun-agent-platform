"use client";

import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
import { Card } from "@/components/ui/card";

const KPIS = [
  { label: "Runs", value: "1,284", delta: "▲ 12%" },
  { label: "Avg latency", value: "1.7s", delta: "▼ +8%" },
  { label: "Tokens", value: "412K", delta: "≈ $2.14" },
  { label: "Error rate", value: "0.9%", delta: "12 errors · 7d" },
];

const RUNS_BARS = [
  20, 35, 28, 50, 70, 60, 85, 92, 78, 65, 55, 48, 42, 58, 72, 80, 88, 95, 75,
  62, 45, 38, 32, 25,
];

// Latency p50 / p95 / p99 over a 7-day window — three series, 7 buckets each.
const LATENCY_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LATENCY_SERIES: Record<"p50" | "p95" | "p99", number[]> = {
  p50: [800, 920, 880, 910, 1020, 850, 870],
  p95: [1700, 1820, 1900, 2100, 2050, 1850, 1780],
  p99: [2400, 2600, 2800, 3100, 3000, 2700, 2500],
};
const LATENCY_MAX = Math.max(...LATENCY_SERIES.p99);

const TOP_TOOLS: [string, number][] = [
  ["lookup_order", 412],
  ["product_specs", 301],
  ["send_tracking", 198],
];

const RECENT_ERRORS = [
  {
    at: "5m ago",
    code: "TimeoutError",
    msg: "Tool call exceeded 30s",
  },
  {
    at: "12m ago",
    code: "ValidationError",
    msg: "Schema mismatch on lookup_order args",
  },
  {
    at: "32m ago",
    code: "MCP/transport",
    msg: "Failed to start filesystem MCP server",
  },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-[var(--color-fg)]">Dashboard</h2>
        <ComingSoonBadge />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs uppercase text-[var(--color-fg)]/60">
                {k.label}
              </div>
              <ComingSoonBadge variant="mocked" />
            </div>
            <div className="text-2xl font-semibold mt-2 text-[var(--color-fg)]">
              {k.value}
            </div>
            <div className="text-xs text-[var(--color-fg)]/60 mt-1">{k.delta}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-[var(--color-fg)]/60">
              Runs over time
            </div>
            <ComingSoonBadge variant="mocked" />
          </div>
          <div className="flex gap-1 items-end h-24">
            {RUNS_BARS.map((h, i) => (
              <div
                key={`bar-${i}`}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  background: "var(--color-primary)",
                }}
              />
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-[var(--color-fg)]/60">
              Latency p50 / p95 / p99 — 7d
            </div>
            <ComingSoonBadge variant="mocked" />
          </div>
          <div className="grid grid-cols-7 gap-2 h-24 items-end">
            {LATENCY_DAYS.map((day, i) => (
              <div
                key={day}
                className="flex flex-col-reverse gap-0.5 items-stretch"
                title={`p50 ${LATENCY_SERIES.p50[i]}ms · p95 ${LATENCY_SERIES.p95[i]}ms · p99 ${LATENCY_SERIES.p99[i]}ms`}
              >
                <div
                  className="rounded-sm"
                  style={{
                    height: `${(LATENCY_SERIES.p50[i] / LATENCY_MAX) * 100}%`,
                    background: "var(--color-primary)",
                  }}
                />
                <div
                  className="rounded-sm"
                  style={{
                    height: `${
                      ((LATENCY_SERIES.p95[i] - LATENCY_SERIES.p50[i]) /
                        LATENCY_MAX) *
                      100
                    }%`,
                    background: "var(--color-accent)",
                  }}
                />
                <div
                  className="rounded-sm"
                  style={{
                    height: `${
                      ((LATENCY_SERIES.p99[i] - LATENCY_SERIES.p95[i]) /
                        LATENCY_MAX) *
                      100
                    }%`,
                    background: "color-mix(in srgb, var(--color-accent) 50%, transparent)",
                  }}
                />
                <div className="text-[10px] text-center text-[var(--color-fg)]/60">
                  {day}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-[var(--color-fg)]/60">
              Top tools
            </div>
            <ComingSoonBadge variant="mocked" />
          </div>
          <ul className="text-sm space-y-1">
            {TOP_TOOLS.map(([name, count]) => (
              <li key={name} className="flex gap-2">
                <span className="font-mono flex-1 text-[var(--color-fg)]">
                  {name}
                </span>
                <span className="text-[var(--color-fg)]/60">{count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-[var(--color-fg)]/60">
              Recent errors
            </div>
            <ComingSoonBadge variant="mocked" />
          </div>
          <ul className="text-sm space-y-2">
            {RECENT_ERRORS.map((e, i) => (
              <li
                key={i}
                className="flex items-start gap-2 border-b border-[var(--color-border)]/40 last:border-0 pb-2 last:pb-0"
              >
                <div className="text-[10px] text-[var(--color-fg)]/50 w-16 flex-shrink-0 pt-0.5">
                  {e.at}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-red-600">
                    {e.code}
                  </div>
                  <div className="text-xs text-[var(--color-fg)]/70 truncate">
                    {e.msg}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
