/**
 * Per-session user identity for chat requests.
 *
 * Resolves once per page load:
 *   - SSO email when an authenticated user is present.
 *   - Fresh `crypto.randomUUID()` otherwise.
 *
 * The result is cached in module state. No localStorage / sessionStorage:
 * anonymous visitors get a new id on every reload, which is what the
 * standalone wants for the open-chat case. `resetUserId()` clears the
 * cache for sign-out flows.
 */

import { useEffect, useState } from "react";

import { getCurrentAuthUser } from "@/lib/auth";

// Cache the in-flight promise (not the resolved value) so concurrent
// callers all await the same resolution. Caching the value created a
// race on cold page load where each caller minted its own uuid before
// `cached` was assigned.
let cached: Promise<string> | null = null;

export function getUserId(): Promise<string> {
  if (cached === null) {
    cached = (async () => {
      const user = await getCurrentAuthUser().catch(() => null);
      return user?.email ?? crypto.randomUUID();
    })();
  }
  return cached;
}

export function resetUserId(): void {
  cached = null;
}

/**
 * React hook returning the resolved user_id, or `null` while resolving.
 * Re-renders the consumer once the value is available.
 */
export function useUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getUserId().then((value) => {
      if (!cancelled) setId(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return id;
}

/**
 * Format a resolved user_id for display in the chat header.
 *
 *   - Emails (contain `@`): returned as-is.
 *   - Otherwise: first 8 chars followed by `…` to keep the header tight.
 *     Covers both engine-minted uuid hex (32 chars) and SPA-minted
 *     `crypto.randomUUID()` (36 chars with dashes) without dropping
 *     the meaningful prefix.
 */
export function formatUserIdForDisplay(value: string): string {
  if (value.includes("@")) return value;
  if (value.length > 8) return `${value.slice(0, 8)}…`;
  return value;
}
