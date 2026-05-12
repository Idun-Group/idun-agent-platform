"use client";

import { useEffect, useState } from "react";
import { fetchSsoInfo, getUserManager } from "@/lib/auth";
import { capture } from "@/lib/telemetry";
import { Events } from "@/lib/telemetry/events";

function issuerHost(issuer: string): string | undefined {
  try {
    return new URL(issuer).host;
  } catch {
    return undefined;
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    (async () => {
      // Resolve the issuer host best-effort so we can attach a `provider`
      // tag. Failures here must not block the actual sign-in.
      const info = await fetchSsoInfo().catch(() => null);
      const provider =
        info && info.enabled ? issuerHost(info.issuer) : undefined;
      try {
        const um = await getUserManager();
        if (!um) throw new Error("SSO is not configured");
        await um.signinRedirectCallback();
        void capture(Events.AUTH_LOGIN_SUCCESS, {
          method: "oidc",
          ...(provider ? { provider } : {}),
          duration_ms: Math.round(performance.now() - startedAt),
        });
        if (!cancelled) window.location.replace("/");
      } catch (e) {
        void capture(Events.AUTH_LOGIN_FAILURE, {
          method: "oidc",
          ...(provider ? { provider } : {}),
          duration_ms: Math.round(performance.now() - startedAt),
          error_class: e instanceof Error ? e.constructor.name : "Unknown",
        });
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sign-in failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid place-items-center min-h-screen bg-background p-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-foreground">
          {error ? "Sign-in failed" : "Signing you in…"}
        </p>
        {error && (
          <>
            <p className="text-xs text-muted-foreground">{error}</p>
            <a
              href="/"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to home
            </a>
          </>
        )}
      </div>
    </div>
  );
}
