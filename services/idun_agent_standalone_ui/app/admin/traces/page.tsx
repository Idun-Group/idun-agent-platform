"use client";

// Placeholder. The real list view (filters + table + pipeline health
// banner) lands in T5b. This stub exists so the route is reachable
// from the sidebar nav while the rest of T5 is in flight.
export default function TracesPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Traces
        </h1>
        <p className="text-sm text-muted-foreground">
          Loading…
        </p>
      </header>
    </div>
  );
}
