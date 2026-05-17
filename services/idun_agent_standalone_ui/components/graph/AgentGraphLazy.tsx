"use client";

/**
 * Lazy-loading client wrapper for `<AgentGraph>` that PRESERVES ref forwarding.
 *
 * `next/dynamic` cannot be used here: its loadable wrapper hijacks the ref
 * via `useImperativeHandle(ref, () => ({ retry }))` (see
 * `node_modules/next/dist/shared/lib/loadable.shared-runtime.js`), so
 * `ref.current` would be `{ retry: <fn> }` instead of `AgentGraphHandle` —
 * breaking the ExportMenu's ability to grab the canvas DOM and node bounds.
 *
 * `React.lazy` + `<Suspense>` forwards refs natively (refs are regular props
 * in React 19 and `lazy()` doesn't interpose). This file is `"use client"`,
 * so during static export the Suspense fallback (skeleton) is rendered on the
 * server and the real component loads after hydration — same UX as
 * `next/dynamic({ ssr: false })` without the ref-hijack.
 */

import { forwardRef, lazy, Suspense } from "react";

import type {
  AgentGraph as AgentGraphIR,
} from "@/lib/api/types/graph";

import type { AgentGraphHandle } from "./AgentGraph";

const AgentGraphInner = lazy(() =>
  import("./AgentGraph").then((m) => ({ default: m.AgentGraph })),
);

interface AgentGraphLazyProps {
  graph: AgentGraphIR;
  height?: number;
}

export const AgentGraphLazy = forwardRef<AgentGraphHandle, AgentGraphLazyProps>(
  function AgentGraphLazy(props, ref) {
    const height = props.height ?? 420;
    return (
      <Suspense
        fallback={
          <div
            style={{ height }}
            className="w-full animate-pulse rounded-md bg-muted"
          />
        }
      >
        <AgentGraphInner {...props} ref={ref} />
      </Suspense>
    );
  },
);

// Re-export the handle type so callers don't need a second import path.
export type { AgentGraphHandle } from "./AgentGraph";
