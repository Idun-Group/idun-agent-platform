"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const pathnameRef = useRef(pathname);
  const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);

  // Keep a ref to the latest pathname so onNextClick callbacks (created
  // once at driver instantiation time) can read the current route without
  // capturing a stale value.
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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
      onNextClick: (_element, _step, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const next = TOUR_STEPS[idx + 1];
        if (!next) {
          opts.driver.moveNext();
          return;
        }
        if (next.route && next.route !== pathnameRef.current) {
          setPendingStepIndex(idx + 1);
          router.push(next.route);
          return;
        }
        opts.driver.moveNext();
      },
      onPopoverRender: (_popover, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const step = TOUR_STEPS[idx];
        if (!step?.element) return; // modal-only step, nothing to anchor
        const found = document.querySelector(step.element);
        if (found) return;
        console.warn(
          `Tour: anchor not found for step ${idx} (${step.element}), advancing`,
        );
        opts.driver.moveNext();
      },
      onDestroyed: () => {
        safeMarkCompleted();
        driverRef.current = null;
        setPendingStepIndex(null);
      },
    });
    driverRef.current = driverInstance;
    driverInstance.drive(0);
  }, [searchParams, pathname, router]);

  // Bridge router navigation → driver.drive() once the new route's DOM
  // is available. rAF gives the new route one frame to commit before we
  // ask Driver.js to anchor on it.
  useEffect(() => {
    if (pendingStepIndex === null) return;
    const expectedRoute = TOUR_STEPS[pendingStepIndex]?.route;
    if (expectedRoute !== pathname) return;
    const handle = requestAnimationFrame(() => {
      driverRef.current?.drive(pendingStepIndex);
      setPendingStepIndex(null);
    });
    return () => cancelAnimationFrame(handle);
  }, [pathname, pendingStepIndex]);

  return <>{children}</>;
}
