"use client";

/**
 * Operational warning rendered above the trace list when the running
 * standalone is backed by SQLite. Copy is locked verbatim by the
 * design KB (trace-feature 08-05-2026 § "Behaviour"); do not paraphrase.
 *
 * The component reads the dialect from `GET /admin/api/v1/traces/_health`
 * (the `databaseDialect` field added in T5b) so the banner only renders
 * on a confirmed signal — Postgres installs and the safe-default
 * `"unknown"` branch both render nothing.
 *
 * Dismissal: an operator who's seen the warning once can close the
 * banner via the `X` button. The dismiss-state is keyed in localStorage
 * under `idun.trace.banner.dismissed` so it survives a page reload but
 * fresh installs (i.e. a different localStorage origin) re-show the
 * banner without manual intervention. The query key is shared with
 * `PipelineHealthPanel` so both consumers hit cache instead of
 * double-polling the same endpoint (#39).
 */

import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TRACE_HEALTH_QUERY_KEY, getTraceHealth } from "@/lib/api/traces";

export type SqliteBannerProps = {
  /**
   * Override the docs anchor for the "Learn more" link. Defaults to
   * the production docs URL — the bundled `/docs/...` path is not
   * shipped with the wheel today.
   */
  learnMoreHref?: string;
};

const DEFAULT_LEARN_MORE_HREF =
  "https://docs.idun.ai/quickstart#switching-to-postgres";

const DISMISS_STORAGE_KEY = "idun.trace.banner.dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
  } catch {
    // localStorage may be disabled (private mode, quota); the banner
    // simply re-appears next reload — no functional regression.
  }
}

export function SqliteBanner({
  learnMoreHref = DEFAULT_LEARN_MORE_HREF,
}: SqliteBannerProps) {
  const { data } = useQuery({
    queryKey: TRACE_HEALTH_QUERY_KEY,
    queryFn: getTraceHealth,
  });

  const [dismissed, setDismissed] = useState(false);
  // Read localStorage on mount (client-only) so SSR/server export
  // doesn't try to touch `window`.
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (data?.databaseDialect !== "sqlite") {
    return null;
  }
  if (dismissed) {
    return null;
  }

  // Locked copy — design KB. Keep verbatim.
  return (
    <Alert data-testid="sqlite-banner" className="relative pr-10">
      <AlertDescription>
        SQLite mode — for local demo only. Performance degrades past
        ~10k traces.{" "}
        <a
          href={learnMoreHref}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Learn more
        </a>
      </AlertDescription>
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 size-7 p-0"
        aria-label="Dismiss SQLite banner"
        data-testid="sqlite-banner-dismiss"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
      >
        <XIcon className="size-3.5" />
      </Button>
    </Alert>
  );
}
