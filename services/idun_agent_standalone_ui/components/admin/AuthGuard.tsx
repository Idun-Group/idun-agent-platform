"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

// /admin/api/v1/auth/me returns 200 `{authenticated: false}` (not 401)
// when password mode is on and there's no session cookie, so the global
// 401 redirect in `lib/api/client.ts` doesn't fire for the `me()` probe
// itself (it still fires for other admin endpoints that return 401).
// Build the `?next=` ourselves from the current location so login
// round-trips back to the admin page the operator was trying to reach.
function loginPathWithNext(): string {
  if (typeof window === "undefined") return "/login/";
  const here = window.location.pathname + window.location.search;
  return `/login/?next=${encodeURIComponent(here)}`;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading, error } = useAuth();
  useEffect(() => {
    if (!isLoading && (error || !data?.authenticated)) {
      router.replace(loginPathWithNext());
    }
  }, [data, error, isLoading, router]);
  if (isLoading)
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  if (!data?.authenticated) return null;
  return <>{children}</>;
}
