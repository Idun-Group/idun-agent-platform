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
 */

import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { getTraceHealth } from "@/lib/api/traces";

export type SqliteBannerProps = {
  /**
   * Override the docs anchor for the "Learn more" link. Defaults to
   * the quickstart anchor that T8 added.
   */
  learnMoreHref?: string;
};

const DEFAULT_LEARN_MORE_HREF = "/docs/quickstart#switching-to-postgres";

export function SqliteBanner({
  learnMoreHref = DEFAULT_LEARN_MORE_HREF,
}: SqliteBannerProps) {
  const { data } = useQuery({
    queryKey: ["traces", "health"],
    queryFn: getTraceHealth,
  });

  if (data?.databaseDialect !== "sqlite") {
    return null;
  }

  // Locked copy — design KB. Keep verbatim.
  return (
    <Alert data-testid="sqlite-banner">
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
    </Alert>
  );
}
