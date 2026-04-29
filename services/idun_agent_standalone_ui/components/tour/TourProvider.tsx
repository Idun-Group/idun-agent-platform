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

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;

    if (!isDesktop) {
      // Tour is desktop-only. Mark completed so a future desktop session
      // landing here doesn't surprise the user with a tour.
      try {
        localStorage.setItem("idun.tour.completed", "true");
      } catch {
        // Private browsing / quota — proceed silently.
      }
      router.replace(pathname);
      return;
    }

    // Desktop trigger lands in Task 5.
  }, [searchParams, pathname, router]);

  return <>{children}</>;
}
