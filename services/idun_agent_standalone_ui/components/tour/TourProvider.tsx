"use client";

import "driver.js/dist/driver.css";
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

/**
 * rAF-poll cap for waiting on a tour step's anchor element to mount.
 * Long enough to cover slow chat-root / admin-layout mounts (the chat
 * root gates WelcomeHero on agentReady; the admin layout has its own
 * loading window). Short enough that a genuinely missing anchor surfaces
 * via the existing onPopoverRender recovery within 2s rather than
 * hanging silently.
 */
const ANCHOR_POLL_CAP_MS = 2_000;

/**
 * Normalize a pathname for trailing-slash-insensitive comparison. The
 * Next.js standalone UI builds with `trailingSlash: true` so `usePathname`
 * yields e.g. `/admin/agent/` while `TOUR_STEPS[i].route` is declared as
 * `/admin/agent`. Without normalization the cross-route bridge would
 * never match and the tour would freeze on step 0.
 */
function normalizeRoute(route: string): string {
  if (route === "/") return route;
  return route.replace(/\/+$/, "");
}

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

  // Cleanup tail shared between the last-step Done branch in onNextClick
  // (which calls destroy() itself) and the onDestroyed callback (which
  // fires from Driver.js's X/Esc/overlay paths). Future additions —
  // analytics, focus restoration — land in one place.
  const markTourCompleteAndTearDown = () => {
    safeMarkCompleted();
    driverRef.current = null;
    setPendingStepIndex(null);
  };

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
          // Last step's "Done" button. Registering an `onNextClick`
          // override suppresses Driver.js's default move/destroy chain,
          // which means `onDestroyed` does not fire reliably when we
          // call `opts.driver.destroy()` from inside this callback.
          // Mark completion + tear down state ourselves so the end-state
          // matches the onDestroyed flow regardless.
          markTourCompleteAndTearDown();
          opts.driver.destroy();
          return;
        }
        if (
          next.route &&
          normalizeRoute(next.route) !== normalizeRoute(pathnameRef.current)
        ) {
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
        // Fires when the user dismisses the tour mid-way (X button, Esc,
        // overlay click). The last-step Done path sets these in the
        // onNextClick override directly because onDestroyed is not
        // dispatched when destroy() is called from within onNextClick.
        markTourCompleteAndTearDown();
      },
    });
    driverRef.current = driverInstance;
    // Wait for step 0's anchor to mount before drive(0). The chat root
    // gates WelcomeHero / ChatInput on `agentReady`, so the wizard
    // handoff (and any first-load `?tour=start`) can race the composer
    // mount — drive(0) would then fire against an empty document and
    // the anchor-missing recovery would cascade through every step. We
    // poll on rAF for up to ~2s, then fall back to drive(0) so a
    // genuinely missing anchor still surfaces via the existing recovery
    // path rather than hanging silently.
    const step0 = TOUR_STEPS[0];
    if (!step0?.element) {
      driverInstance.drive(0);
    } else if (typeof document !== "undefined" && document.querySelector(step0.element)) {
      driverInstance.drive(0);
    } else {
      const startedAt = Date.now();
      const tryDrive = () => {
        if (driverRef.current !== driverInstance) return; // destroyed/replaced
        if (
          (typeof document !== "undefined" && document.querySelector(step0.element!)) ||
          Date.now() - startedAt > ANCHOR_POLL_CAP_MS
        ) {
          driverInstance.drive(0);
          return;
        }
        requestAnimationFrame(tryDrive);
      };
      requestAnimationFrame(tryDrive);
    }
  }, [searchParams, pathname, router]);

  // Bridge router navigation → driver.drive() once the new route's DOM
  // is available. We rAF-poll up to ~2s for the next step's anchor so
  // cross-route navigations don't race a sub-tree mount (e.g. the admin
  // layout's own loading window). When the anchor exists or the safety
  // cap elapses, drive() fires; the existing onPopoverRender recovery
  // handles the cap-elapsed case.
  useEffect(() => {
    if (pendingStepIndex === null) return;
    const step = TOUR_STEPS[pendingStepIndex];
    if (!step?.route) return;
    if (normalizeRoute(step.route) !== normalizeRoute(pathname)) return;
    let handle: number | null = null;
    let cancelled = false;
    const startedAt = Date.now();
    const tryDrive = () => {
      if (cancelled) return;
      const driverInstance = driverRef.current;
      if (!driverInstance) {
        setPendingStepIndex(null);
        return;
      }
      const anchorReady =
        !step.element ||
        (typeof document !== "undefined" && document.querySelector(step.element));
      if (anchorReady || Date.now() - startedAt > ANCHOR_POLL_CAP_MS) {
        driverInstance.drive(pendingStepIndex);
        setPendingStepIndex(null);
        return;
      }
      handle = requestAnimationFrame(tryDrive);
    };
    handle = requestAnimationFrame(tryDrive);
    return () => {
      cancelled = true;
      if (handle !== null) cancelAnimationFrame(handle);
    };
  }, [pathname, pendingStepIndex]);

  return <>{children}</>;
}
