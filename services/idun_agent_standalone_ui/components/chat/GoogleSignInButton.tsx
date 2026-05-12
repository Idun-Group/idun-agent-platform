"use client";

import { jwtDecode } from "jwt-decode";
import { useEffect, useRef, useState } from "react";
import { setManualToken } from "@/lib/auth";
import { capture } from "@/lib/telemetry";
import { Events } from "@/lib/telemetry/events";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            opts: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function ensureGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("gsi load error")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gsi load error"));
    document.body.appendChild(s);
  });
}

export function GoogleSignInButton({
  clientId,
  onSignedIn,
}: {
  clientId: string;
  onSignedIn: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Track the wall-clock time of the mount as a proxy for "start" — Google's
    // own button click is not observable to us, so duration measures the
    // mount-to-credential window for this provider.
    const startedAt = performance.now();
    ensureGsiScript()
      .then(() => {
        if (cancelled || !window.google || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            if (!res?.credential) {
              void capture(Events.AUTH_LOGIN_FAILURE, {
                method: "oidc",
                provider: "accounts.google.com",
                duration_ms: Math.round(performance.now() - startedAt),
                error_class: "NoCredential",
              });
              return;
            }
            try {
              jwtDecode(res.credential);
            } catch {
              void capture(Events.AUTH_LOGIN_FAILURE, {
                method: "oidc",
                provider: "accounts.google.com",
                duration_ms: Math.round(performance.now() - startedAt),
                error_class: "InvalidCredential",
              });
              setError("Invalid credential from Google");
              return;
            }
            setManualToken(res.credential);
            void capture(Events.AUTH_LOGIN_SUCCESS, {
              method: "oidc",
              provider: "accounts.google.com",
              duration_ms: Math.round(performance.now() - startedAt),
            });
            onSignedIn();
          },
          auto_select: false,
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 280,
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load Google Sign-In");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedIn]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
