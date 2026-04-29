"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { TOUR_STEPS } from "./tour-steps";

const COMPLETED_KEY = "idun.tour.completed";

function safeMarkCompleted(): void {
  try {
    localStorage.setItem(COMPLETED_KEY, "true");
  } catch {
    // Private browsing / quota — proceed silently.
  }
}

function safeClearCompleted(): void {
  try {
    localStorage.removeItem(COMPLETED_KEY);
  } catch {
    // Private browsing / quota — proceed silently.
  }
}

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
  // Consume on first arrival; resize/replay requires a fresh ?tour=start
  // round-trip (the ref resets on remount/refresh).
  const tourStartedRef = useRef(false);
  const driverRef = useRef<Driver | null>(null);

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
      safeMarkCompleted();
      router.replace(pathname);
      return;
    }

    // Desktop path: clear the flag (per Q5 A — `?tour=start` always re-fires
    // even after prior completion), strip the URL param, ensure we're on
    // the chat root before showing step 0, instantiate driver, drive(0).
    safeClearCompleted();
    router.replace(pathname);
    if (pathname !== "/") {
      router.push("/");
    }

    const driverInstance = driver({
      showProgress: true,
      steps: TOUR_STEPS.map((step) => ({
        element: step.element,
        popover: {
          title: step.popover.title,
          description: step.popover.description,
        },
      })),
    });
    driverRef.current = driverInstance;
    driverInstance.drive(0);
  }, [searchParams, pathname, router]);

  return <>{children}</>;
}
