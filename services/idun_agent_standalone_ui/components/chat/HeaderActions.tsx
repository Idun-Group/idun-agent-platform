"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  type RuntimeConfig,
  getRuntimeConfig,
} from "@/lib/runtime-config";

type Props = {
  threadId?: string;
  onNewSession?: () => void;
};

const PILL =
  "rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";

/**
 * Editorial header pills shared by every chat layout. Renders a "New
 * conversation" pill, a link to the admin panel, and (when password auth is
 * enabled) a sign-out pill. The admin link is always visible because the
 * route itself enforces auth — anonymous deployments can still inspect
 * configuration.
 */
export function HeaderActions({ onNewSession }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  // Read runtime config inside an effect so SSR / static export remain
  // deterministic and we don't dereference window during render.
  useEffect(() => {
    setConfig(getRuntimeConfig());
  }, []);

  const authMode = config?.authMode ?? "none";

  const handleNewSession = () => {
    if (onNewSession) {
      onNewSession();
      return;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    router.push(`/?session=${id}`);
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch {
      // Even if the logout request fails we still want to drop the local
      // session: the cookie may already be gone server-side.
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login/";
    }
  };

  // TODO(B7+): expose user email/username via /admin/api/v1/auth/me so we
  // can render an account chip here. Today the endpoint only returns
  // `authenticated` + `auth_mode`.

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handleNewSession} className={PILL}>
        New conversation
      </button>
      <Link href="/admin/" className={PILL}>
        Admin
      </Link>
      {authMode === "password" ? (
        <button type="button" onClick={handleSignOut} className={PILL}>
          Sign out
        </button>
      ) : null}
    </div>
  );
}
