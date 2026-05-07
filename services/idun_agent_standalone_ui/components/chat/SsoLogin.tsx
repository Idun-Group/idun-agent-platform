"use client";

import { useState } from "react";
import { isGoogleIssuer, signIn } from "@/lib/auth";
import { GoogleSignInButton } from "./GoogleSignInButton";

export function SsoLogin({
  issuer,
  clientId,
  onSignedIn,
}: {
  issuer: string;
  clientId: string;
  onSignedIn: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const host = (() => {
    try {
      return new URL(issuer).host;
    } catch {
      return issuer;
    }
  })();
  const google = isGoogleIssuer(issuer);

  const onRedirect = async () => {
    setBusy(true);
    try {
      await signIn();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="grid place-items-center min-h-screen bg-background p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="font-serif text-3xl font-medium text-foreground">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This agent is protected. Authenticate with{" "}
            <span className="text-foreground">{host}</span>.
          </p>
        </div>
        {google ? (
          <div className="flex justify-center">
            <GoogleSignInButton clientId={clientId} onSignedIn={onSignedIn} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onRedirect}
            disabled={busy}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Redirecting…" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
