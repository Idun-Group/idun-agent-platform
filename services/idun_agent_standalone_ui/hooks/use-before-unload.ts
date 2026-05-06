"use client";

import { useEffect } from "react";

/**
 * Block tab close / hard refresh while `when` is true.
 *
 * Coverage is intentionally limited to `beforeunload`:
 * - Catches: closing the tab, hitting refresh.
 * - Misses:  client-side navigation via Next.js Link.
 *
 * The dirty-badge in `<AdminPageHeader>` provides continuous
 * visual signal for the in-app navigation case; if real complaints
 * surface, a route guard can land later as a separate component.
 */
export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy spec; required by Chrome
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
