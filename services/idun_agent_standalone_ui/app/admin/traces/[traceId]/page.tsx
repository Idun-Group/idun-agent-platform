"use client";

import { useParams } from "next/navigation";

// Placeholder. The real detail view (tree + waterfall + span detail
// rail) lands in T5d. The route param is captured here so deep links
// from the list view stay valid while the implementation is in flight.
export default function TraceDetailPage() {
  const params = useParams<{ traceId: string }>();
  const traceId = params?.traceId ?? "";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Trace
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{traceId}</p>
      </header>
    </div>
  );
}
