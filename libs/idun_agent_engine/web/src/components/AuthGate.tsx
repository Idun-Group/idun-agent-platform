"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  authHeaders,
  clearStoredToken,
  fetchAuthConfig,
  getStoredToken,
  type AuthConfig,
} from "@/lib/auth";
import SsoLogin from "./SsoLogin";

type Status =
  | { kind: "loading" }
  | { kind: "open" }
  | { kind: "needs-login"; issuer: string; clientId: string; reason?: string }
  | { kind: "authed" }
  | { kind: "error"; message: string };

async function checkTokenAccepted(): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const res = await fetch("/agent/capabilities", {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.ok) return { ok: true };
  let reason = res.statusText || `${res.status}`;
  try {
    const body = await res.json();
    if (body?.detail) reason = String(body.detail);
  } catch { /* ignore */ }
  return { ok: false, status: res.status, reason };
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [verifying, setVerifying] = useState(false);
  const hasBooted = useRef(false);

  const refresh = useCallback(async () => {
    // On subsequent refreshes (e.g. after the Google callback), we don't
    // flash the full-screen spinner — we keep the current view and show
    // a small "verifying" indicator instead. Only the very first mount
    // uses the blank loading state.
    if (hasBooted.current) setVerifying(true);
    try {
      const cfg: AuthConfig = await fetchAuthConfig();
      if (!cfg.sso.enabled) {
        setStatus({ kind: "open" });
        return;
      }
      if (!getStoredToken()) {
        setStatus((prev) => ({
          kind: "needs-login",
          issuer: cfg.sso.enabled ? cfg.sso.issuer : "",
          clientId: cfg.sso.enabled ? cfg.sso.clientId : "",
          reason: prev.kind === "needs-login" ? prev.reason : undefined,
        }));
        return;
      }
      const check = await checkTokenAccepted();
      if (check.ok) {
        setStatus({ kind: "authed" });
      } else {
        clearStoredToken();
        const issuer = cfg.sso.enabled ? cfg.sso.issuer : "";
        const clientId = cfg.sso.enabled ? cfg.sso.clientId : "";
        setStatus({ kind: "needs-login", issuer, clientId, reason: check.reason });
      }
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message ?? "Failed to load auth config" });
    } finally {
      hasBooted.current = true;
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status.kind === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <span className="pulse-dot" />
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas px-6 text-center">
        <div className="max-w-sm">
          <p className="mb-3 font-serif text-[22px] text-ink">Couldn't reach the engine</p>
          <p className="text-[13.5px] text-muted">{status.message}</p>
        </div>
      </div>
    );
  }

  if (status.kind === "needs-login") {
    return (
      <div className="relative flex h-screen items-center justify-center bg-canvas px-6">
        <div className="halo" />
        <div className="relative z-10">
          <SsoLogin
            issuer={status.issuer}
            clientId={status.clientId}
            rejectionReason={status.reason}
            busy={verifying}
            onSignedIn={refresh}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
