"use client";

import { useEffect, useRef, useState } from "react";
import { setStoredToken } from "@/lib/auth";
import { IdunMark } from "./Logos";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            opts: Record<string, string | number | boolean>
          ) => void;
          prompt: () => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function isGoogleIssuer(issuer: string): boolean {
  try {
    return new URL(issuer).host === "accounts.google.com";
  } catch {
    return false;
  }
}

function ensureGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi load error")));
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

export default function SsoLogin({
  issuer,
  clientId,
  rejectionReason,
  busy,
  onSignedIn,
}: {
  issuer: string;
  clientId: string;
  rejectionReason?: string;
  busy?: boolean;
  onSignedIn: () => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const google = isGoogleIssuer(issuer);

  useEffect(() => {
    if (!google) return;
    let cancelled = false;
    ensureGsiScript()
      .then(() => {
        if (cancelled || !window.google || !btnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            if (!res?.credential) return;
            setStoredToken(res.credential);
            onSignedIn();
          },
          auto_select: false,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 280,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load Google Sign-In");
      });
    return () => {
      cancelled = true;
    };
  }, [google, clientId, onSignedIn]);

  function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    const t = pasted.trim();
    if (!t) return;
    setStoredToken(t);
    onSignedIn();
  }

  const host = (() => {
    try { return new URL(issuer).host; } catch { return issuer; }
  })();

  return (
    <div className="welcome-reveal w-full max-w-md text-center">
      <div className="mb-8 flex items-center justify-center">
        <IdunMark className="h-14" />
      </div>
      <h1 className="mb-3 font-serif text-[40px] leading-[1.05] font-medium tracking-[-0.02em] text-ink">
        Sign in to <span className="italic text-accent">continue</span>
      </h1>
      <p className="mx-auto mb-5 max-w-sm text-[14.5px] leading-relaxed text-muted">
        This agent is protected. Authenticate with{" "}
        <span className="text-ink">{host}</span> to start chatting.
      </p>

      {rejectionReason && (
        <div className="mx-auto mb-5 max-w-sm rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-left text-[13px] leading-snug text-rose-800">
          <span className="font-medium">Sign-in rejected.</span> {rejectionReason}
        </div>
      )}

      {google ? (
        <div className={`flex justify-center transition ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <div ref={btnRef} />
        </div>
      ) : (
        <p className="text-[13px] text-muted">
          Issuer <code className="font-mono">{host}</code> isn't yet supported in-browser. Use the paste option below.
        </p>
      )}

      {error && (
        <p className="mt-3 text-[12.5px] text-rose-700">{error}</p>
      )}

      <button
        onClick={() => setShowPaste((v) => !v)}
        className="mt-5 text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {showPaste ? "Hide advanced" : "I already have a token"}
      </button>

      {showPaste && (
        <form onSubmit={submitPaste} className="mt-4 space-y-3 text-left">
          <label className="block text-[12px] font-medium uppercase tracking-wider text-muted">
            Bearer token
          </label>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="eyJhbGciOi…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-rule bg-surface px-4 py-3 font-mono text-[12px] text-ink placeholder:text-muted focus:border-accent/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!pasted.trim()}
            className="w-full rounded-xl border border-rule bg-surface px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-canvas disabled:opacity-40"
          >
            Use this token
          </button>
          <p className="text-[11px] text-muted">
            Client ID: <code className="font-mono">{clientId}</code>
          </p>
        </form>
      )}
    </div>
  );
}
