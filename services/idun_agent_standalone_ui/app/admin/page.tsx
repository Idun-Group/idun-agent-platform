"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const KPIS = [
  { label: "Runs", value: "1,284", delta: "▲ 12%" },
  { label: "Avg latency", value: "1.7s", delta: "▼ +8%" },
  { label: "Tokens", value: "412K", delta: "≈ $2.14" },
  { label: "Error rate", value: "0.9%", delta: "12 errors · 7d" },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-[var(--color-fg)]">Dashboard</h2>
        <Badge tone="warning">Coming soon — mocked data</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs uppercase text-[var(--color-fg)]/60">
                {k.label}
              </div>
              <Badge tone="warning">mocked</Badge>
            </div>
            <div className="text-2xl font-semibold mt-2 text-[var(--color-fg)]">
              {k.value}
            </div>
            <div className="text-xs text-[var(--color-fg)]/60 mt-1">
              {k.delta}
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-[var(--color-fg)]/60">
            Runs over time
          </div>
          <Badge tone="warning">mocked</Badge>
        </div>
        <div className="flex gap-1 items-end h-24">
          {[
            20, 35, 28, 50, 70, 60, 85, 92, 78, 65, 55, 48, 42, 58, 72, 80, 88,
            95, 75, 62, 45, 38, 32, 25,
          ].map((h) => (
            <div
              key={`bar-${h}`}
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
            Top tools
          </div>
          <Badge tone="warning">mocked</Badge>
        </div>
        <ul className="text-sm space-y-1">
          {[
            ["lookup_order", 412],
            ["product_specs", 301],
            ["send_tracking", 198],
          ].map(([name, count]) => (
            <li key={String(name)} className="flex gap-2">
              <span className="font-mono flex-1 text-[var(--color-fg)]">
                {name}
              </span>
              <span className="text-[var(--color-fg)]/60">{count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
