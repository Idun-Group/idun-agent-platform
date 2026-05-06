"use client";

import { useEffect, useState } from "react";
import { getUserManager } from "@/lib/auth";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const um = await getUserManager();
        if (!um) throw new Error("SSO is not configured");
        await um.signinRedirectCallback();
        if (!cancelled) window.location.replace("/");
      } catch (e) {
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
