"use client";

import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";

const LEVELS = ["All", "Info", "Warn", "Error", "Debug"] as const;

const FAKE: Array<[string, "INFO" | "WARN" | "ERROR" | "DEBUG", string, string]> = [
  ["11:04:12", "INFO", "agent.run", "RunStarted run_id=run_0001 thread=sess_a1f7e0c3"],
  ["11:04:12", "DEBUG", "langgraph.node", "node=router → tool_call"],
  ["11:04:12", "INFO", "tools.lookup_order", "invoked order_id=4482"],
  ["11:04:12", "INFO", "tools.lookup_order", "ok duration=182ms status=shipped"],
  ["11:04:13", "INFO", "llm.openai", "completion model=gpt-4o tokens=812 duration=1.2s"],
  ["11:04:13", "INFO", "agent.run", "RunFinished total=1.7s"],
  ["11:04:47", "INFO", "agent.run", "RunStarted run_id=run_0002"],
  ["11:04:47", "WARN", "guardrails.pii", "input contains possible email masked=j***@e****.com"],
  ["11:04:47", "INFO", "tools.send_tracking", "invoked order_id=4482"],
  ["11:04:47", "ERROR", "mcp.time-server", "connection refused retries=2 next=5s"],
  ["11:04:48", "INFO", "agent.run", "RunFinished total=1.0s"],
];

const LEVEL_COLOR: Record<string, string> = {
  INFO: "text-blue-500",
  WARN: "text-amber-500",
  ERROR: "text-red-500",
  DEBUG: "text-[var(--color-fg)]/40",
};

export default function LogsPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
        <h2 className="font-semibold">Logs</h2>
        <ComingSoonBadge />
        <div className="ml-4 flex gap-1 text-xs">
          {LEVELS.map((l) => (
            <button
              type="button"
              key={l}
              disabled
              title="Coming in MVP-2"
              className={`px-2 py-0.5 rounded cursor-not-allowed opacity-50 ${l === "All" ? "bg-[var(--color-primary)] text-white" : ""}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2 items-center text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
          <button
            type="button"
            disabled
            title="Coming in MVP-2"
            className="px-2 py-1 border border-[var(--color-border)] rounded cursor-not-allowed opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            disabled
            title="Coming in MVP-2"
            className="px-2 py-1 border border-[var(--color-border)] rounded cursor-not-allowed opacity-50"
          >
            Clear
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 font-mono text-[11px]">
        {FAKE.map(([ts, lvl, logger, msg]) => (
          <div
            key={`${ts}-${logger}-${msg}`}
            className="grid grid-cols-[90px_60px_160px_1fr] gap-3"
          >
            <span className="text-[var(--color-fg)]/40">{ts}</span>
            <span className={LEVEL_COLOR[lvl]}>{lvl}</span>
            <span className="text-purple-400">{logger}</span>
            <span className="text-[var(--color-fg)]/80">{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
