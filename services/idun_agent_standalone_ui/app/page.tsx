"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { ApiError, api } from "@/lib/api";
import { BrandedLayout } from "@/components/chat/BrandedLayout";
import { MinimalLayout } from "@/components/chat/MinimalLayout";
import { InspectorLayout } from "@/components/chat/InspectorLayout";

function ChatHome() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = useMemo(
    () => params.get("session") ?? crypto.randomUUID(),
    [params],
  );
  const [layout, setLayout] = useState<"branded" | "minimal" | "inspector">(
    "branded",
  );
  const [agentReady, setAgentReady] = useState<boolean | null>(null);

  useEffect(() => {
    setLayout(getRuntimeConfig().layout);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getAgent()
      .then(() => {
        if (!cancelled) setAgentReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/onboarding");
        } else {
          // Non-404 errors don't block chat from rendering. 401 is already
          // handled by apiFetch (hard-redirects to /login/?next=…); other
          // errors (network, 5xx) fall through and the chat layouts surface
          // them on the next API call. Doubles as a flash-of-default-layout
          // guard until the runtime-config layout effect resolves.
          setAgentReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (agentReady !== true) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (layout === "minimal") return <MinimalLayout threadId={threadId} />;
  if (layout === "inspector") return <InspectorLayout threadId={threadId} />;
  return <BrandedLayout threadId={threadId} />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-sm">Loading…</div>}>
      <ChatHome />
    </Suspense>
  );
}
