"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { identify, reset } from "@/lib/telemetry";
import { useAuth } from "@/lib/use-auth";

/** Stable distinct-id we can extract from an authenticated user response.
 * Returns null if the auth payload doesn't expose one (e.g. password-auth
 * mode reports only {authenticated, authMode} with no identity). */
function extractDistinctId(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.email === "string" && u.email) return u.email;
  if (typeof u.sub === "string" && u.sub) return u.sub;
  if (typeof u.id === "string" && u.id) return u.id;
  return null;
}

/**
 * Mount once in app/layout.tsx. Identifies/resets when an extractable
 * distinct id appears or disappears. The lib/telemetry/* functions are
 * no-ops when telemetry is disabled, so this provider is safe to mount
 * unconditionally.
 *
 * In password-auth mode the auth response is identity-less ({authenticated,
 * authMode}); we simply stay on the anonymous browser-generated id and skip
 * identify(). In OIDC mode, `email` (or `sub`) becomes the distinct id.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const lastDistinctId = useRef<string | null>(null);

  useEffect(() => {
    const distinctId = extractDistinctId(user);
    if (distinctId && distinctId !== lastDistinctId.current) {
      void identify(distinctId, {});
      lastDistinctId.current = distinctId;
    } else if (!distinctId && lastDistinctId.current) {
      void reset();
      lastDistinctId.current = null;
    }
  }, [user]);

  return <>{children}</>;
}
