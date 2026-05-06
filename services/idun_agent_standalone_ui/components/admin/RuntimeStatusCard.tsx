"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import type { RuntimeStatus } from "@/lib/api/types";

const POLL_INTERVAL_MS = 60_000;

function StatusBadge({ status }: { status: RuntimeStatus["lastStatus"] }) {
  if (status === "reloaded") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Reloaded
      </Badge>
    );
  }
  if (status === "restart_required") {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
        <RotateCcw className="mr-1 h-3 w-3" />
        Restart required
      </Badge>
    );
  }
  if (status === "reload_failed") {
    return (
      <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Reload failed
      </Badge>
    );
  }
  return <Badge variant="outline">Unknown</Badge>;
}

export function RuntimeStatusCard() {
  const { data, isLoading } = useQuery({
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime status</CardTitle>
        <CardDescription>
          The last reload outcome. Polls every {POLL_INTERVAL_MS / 1000}s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading && (
          <p className="text-muted-foreground">Loading…</p>
        )}
        {!isLoading && !data && (
          <p className="text-muted-foreground italic">
            No reload has been attempted yet.
          </p>
        )}
        {data && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <StatusBadge status={data.lastStatus} />
            </div>
            {data.lastMessage && (
              <div>
                <span className="font-medium">Message:</span>{" "}
                <span className="text-muted-foreground">{data.lastMessage}</span>
              </div>
            )}
            {data.lastError && (
              <div>
                <span className="font-medium">Error:</span>{" "}
                <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {data.lastError}
                </pre>
              </div>
            )}
            {data.lastReloadedAt && (
              <div>
                <span className="font-medium">Last reloaded:</span>{" "}
                <span className="text-muted-foreground">
                  {new Date(data.lastReloadedAt).toLocaleString()}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
