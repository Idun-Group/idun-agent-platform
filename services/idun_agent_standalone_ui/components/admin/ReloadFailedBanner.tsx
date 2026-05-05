"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError, api } from "@/lib/api";

const POLL_INTERVAL_MS = 60_000;

/**
 * Sticky shell-level banner that appears only when the last reload
 * attempt failed. Polls /admin/api/v1/runtime/status every 60s.
 *
 * Mounts in app/admin/layout.tsx so every admin page gets it without
 * each page wiring it up. 404 from the backend (fresh install, no
 * row yet) is treated as "nothing to show".
 */
export function ReloadFailedBanner() {
  const { data } = useQuery({
    queryKey: ["runtime-status"],
    queryFn: async () => {
      try {
        return await api.getRuntimeStatus();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  if (!data || data.lastStatus !== "reload_failed") {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-destructive/20 bg-destructive/5 px-6 py-3">
      <Alert variant="destructive" className="border-0 bg-transparent p-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {data.lastMessage ?? "Engine reload failed; config not saved."}
        </AlertTitle>
        {data.lastError && (
          <AlertDescription className="font-mono text-xs">
            {data.lastError}
          </AlertDescription>
        )}
      </Alert>
    </div>
  );
}
