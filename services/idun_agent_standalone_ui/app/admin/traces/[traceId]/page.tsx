// Server-side wrapper for the trace detail page.
//
// Two reasons this file exists separately from TraceDetailClient.tsx:
//
//   1. Next.js's output:export requires every dynamic route to export
//      a generateStaticParams() -- a server-only API. The sibling
//      client component cannot host it because it has the "use client"
//      directive at the top.
//
//   2. The bundled standalone serves the static export with FastAPI's
//      StaticFiles(html=True). To make /admin/traces/<id>/ reachable
//      for any runtime trace ID, the build needs at least one
//      materialised path (the placeholder below) and a backend
//      SPA-rewrite rule that maps /admin/traces/*/ to that
//      placeholder's index.html. The placeholder shell defers to
//      useParams() at runtime to read the actual id off
//      window.location -- there is nothing trace-id-specific in the
//      generated HTML.
//
// SPA-rewrite status: live. The standalone backend's
// ``GET /admin/traces/{trace_id}`` route at
// ``libs/idun_agent_standalone/src/idun_agent_standalone/app.py`` maps
// any deep link to the static placeholder shell, and FastAPI's
// default ``redirect_slashes=True`` covers the trailing-slash
// variant. The client reads the real id off ``window.location`` via
// ``useParams()`` inside the client component -- a fresh document
// load and an in-app Link both render identically.

import { Suspense } from "react";

import TraceDetailClient from "./TraceDetailClient";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ traceId: string }> {
  // One placeholder so a single static shell exists at build time.
  // The runtime trace id is read off the URL via useParams() inside
  // the client component.
  return [{ traceId: "__trace__" }];
}

export default function TraceDetailPage() {
  // ``TraceDetailClient`` calls ``useSearchParams`` for URL-stateful
  // ``?view=`` and ``?span=`` (P3 audit findings #19, #33). Next.js 15
  // requires that hook to be wrapped in a Suspense boundary in static-
  // export mode, otherwise the entire route bails out to client-side
  // rendering and silently renders nothing on the first paint —
  // exactly the "click a trace, see no detail" symptom this page hit
  // until this wrapper landed.
  return (
    <Suspense fallback={null}>
      <TraceDetailClient />
    </Suspense>
  );
}
