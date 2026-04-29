"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Mounted in app/layout.tsx — owns the in-memory state of the guided
 * product tour across SPA navigations.
 *
 * The provider is dormant until ?tour=start arrives in the URL. See
 * docs/superpowers/specs/2026-04-29-guided-tour-design.md for the full
 * contract.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tourStartedRef = useRef(false);

  useEffect(() => {
    if (searchParams.get("tour") !== "start") return;
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;
    // Trigger logic lands in Tasks 4-7. For now: idempotent no-op so the
    // provider can be mounted without firing anything.
  }, [searchParams, pathname, router]);

  return <>{children}</>;
}
