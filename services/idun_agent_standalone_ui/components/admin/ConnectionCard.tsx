"use client";

import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";

type VerifyStatus = "idle" | "checking" | "connected" | "failed";

const VERIFY_MAX_ATTEMPTS = 4;
const VERIFY_INTERVAL_MS = 5000;

export function ConnectionCard() {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const verify = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("checking");
    setError(null);
    setName(null);

    for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) {
      if (controller.signal.aborted) return;
      setAttempt(i + 1);
      try {
        const health = await api.checkAgentHealth();
        if (controller.signal.aborted) return;
        if (health.status === "ok") {
          setName(health.agent_name ?? null);
          setStatus("connected");
          return;
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        const detail =
          e instanceof ApiError
            ? ((e.detail as { error?: { message?: string } } | undefined)?.error
                ?.message ?? `Engine returned ${e.status}.`)
            : e instanceof Error
              ? e.message
              : "Unreachable.";
        setError(detail);
      }
      if (i < VERIFY_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, VERIFY_INTERVAL_MS));
      }
    }
    if (!controller.signal.aborted) setStatus("failed");
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Probe the engine&apos;s health endpoint. Useful after a restart or a
            config change.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={verify}
          disabled={status === "checking"}
        >
          {status === "checking" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <Wifi className="mr-2 h-4 w-4" />
              Verify connection
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Click <em>Verify connection</em> to probe <code>/health</code>.
          </p>
        )}
        {status === "checking" && (
          <p className="text-sm text-muted-foreground italic">
            Attempt {attempt} of {VERIFY_MAX_ATTEMPTS}, retrying every{" "}
            {VERIFY_INTERVAL_MS / 1000}s…
          </p>
        )}
        {status === "connected" && (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <Wifi />
            <AlertTitle>Agent is healthy</AlertTitle>
            <AlertDescription>
              {name
                ? `Engine reports the running agent as "${name}".`
                : "Engine is responsive."}
            </AlertDescription>
          </Alert>
        )}
        {status === "failed" && (
          <Alert variant="destructive">
            <WifiOff />
            <AlertTitle>Could not reach the agent</AlertTitle>
            <AlertDescription>
              {error ??
                `No response after ${VERIFY_MAX_ATTEMPTS} attempts. Make sure the engine is running.`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
