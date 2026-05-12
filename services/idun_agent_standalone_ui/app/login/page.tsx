"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { capture } from "@/lib/telemetry";
import { Events } from "@/lib/telemetry/events";

function isSafeNext(next: string): boolean {
  // Only same-origin paths. Reject `https://evil.com`, `//evil.com`,
  // `http://`, etc. — open redirect guard.
  return next.startsWith("/") && !next.startsWith("//");
}

// Pick the post-login destination. Same-origin paths are honored, except
// /login itself — redirecting to /login would loop. Falls back to "/".
function pickPostLoginPath(raw: string): string {
  const candidate = isSafeNext(raw) ? raw : "/";
  if (candidate === "/login" || candidate.startsWith("/login/")) return "/";
  return candidate;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // When admin auth is disabled the password form does nothing on submit,
  // so redirect to the chat root. Read window.__IDUN_CONFIG__.authMode
  // directly (not via getRuntimeConfig, which defaults to "none" when the
  // runtime-config.js hasn't loaded yet — that fallback would lock
  // operators out if the bootstrap script ever fails). Treat undefined as
  // "config not loaded yet, show the form" rather than auto-redirecting.
  const configuredAuthMode =
    typeof window !== "undefined"
      ? window.__IDUN_CONFIG__?.authMode
      : undefined;
  const authDisabled = configuredAuthMode === "none";
  useEffect(() => {
    if (!authDisabled) return;
    const raw = params?.get("next") ?? "/";
    router.replace(pickPostLoginPath(raw));
  }, [authDisabled, params, router]);
  if (authDisabled) return null;

  return (
    <div className="grid place-items-center min-h-screen bg-background p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Enter the admin password configured for this deployment.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const startedAt = performance.now();
            void capture(Events.AUTH_LOGIN_START, { method: "basic" });
            try {
              await api.login(password);
              void capture(Events.AUTH_LOGIN_SUCCESS, {
                method: "basic",
                duration_ms: Math.round(performance.now() - startedAt),
              });
              const raw = params?.get("next") ?? "/";
              router.replace(pickPostLoginPath(raw));
            } catch (err) {
              const status = err instanceof ApiError ? err.status : 0;
              void capture(Events.AUTH_LOGIN_FAILURE, {
                method: "basic",
                duration_ms: Math.round(performance.now() - startedAt),
                error_class:
                  err instanceof Error ? err.constructor.name : "Unknown",
              });
              toast.error(
                status === 401 ? "Invalid credentials" : "Sign-in failed",
              );
              setPassword("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground" htmlFor="pw">
              Admin password
            </Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
