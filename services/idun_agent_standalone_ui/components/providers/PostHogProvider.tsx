"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { identify, reset } from "@/lib/telemetry";
import { useAuth } from "@/lib/use-auth";

/**
 * Mount once in app/layout.tsx. Initializes the PostHog client on first
 * render and identifies/resets when the auth state transitions. The
 * lib/telemetry/* functions are no-ops when telemetry is disabled, so this
 * provider is safe to mount unconditionally.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const lastDistinctId = useRef<string | null>(null);

  useEffect(() => {
    const email = user?.email ?? null;
    if (email && email !== lastDistinctId.current) {
      void identify(email, {});
      lastDistinctId.current = email;
    } else if (!email && lastDistinctId.current) {
      void reset();
      lastDistinctId.current = null;
    }
  }, [user?.email]);

  return <>{children}</>;
}
