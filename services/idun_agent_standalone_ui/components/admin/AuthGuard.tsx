"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading, error } = useAuth();
  useEffect(() => {
    if (!isLoading && (error || !data?.authenticated)) {
      router.replace("/login/");
    }
  }, [data, error, isLoading, router]);
  if (isLoading)
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  if (!data?.authenticated) return null;
  return <>{children}</>;
}
