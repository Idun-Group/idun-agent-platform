"use client";

import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/api";

const RANGES: DashboardRange[] = ["1h", "24h", "7d", "30d"];

export function RangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="inline-flex overflow-hidden rounded-md border border-border bg-background"
    >
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(r);
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
