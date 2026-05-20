"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRuntimeConfig } from "@/lib/runtime-config";
import {
  fetchSsoInfo,
  getCurrentAuthUser,
  type SsoInfo,
} from "@/lib/auth";
import { BrandedLayout } from "@/components/chat/BrandedLayout";
import { MinimalLayout } from "@/components/chat/MinimalLayout";
import { InspectorLayout } from "@/components/chat/InspectorLayout";
import { SsoLogin } from "@/components/chat/SsoLogin";

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
  const [ssoInfo, setSsoInfo] = useState<SsoInfo | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setLayout(getRuntimeConfig().layout);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await fetchSsoInfo().catch(() => null);
      if (cancelled) return;
      const resolved: SsoInfo = info ?? { enabled: false };
      setSsoInfo(resolved);
      if (!resolved.enabled) {
        setSignedIn(true);
        return;
      }
      const user = await getCurrentAuthUser().catch(() => null);
      if (!cancelled) setSignedIn(user !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (signedIn !== true) return;
    const cfg = getRuntimeConfig();
    if (!cfg.agentReady && !cfg.bootFailed) {
      router.replace("/onboarding");
      return;
    }
    setAgentReady(true);
  }, [router, signedIn]);

  if (ssoInfo === null || signedIn === null) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (ssoInfo.enabled && !signedIn) {
    return (
      <SsoLogin
        issuer={ssoInfo.issuer}
        clientId={ssoInfo.clientId}
        onSignedIn={() => setSignedIn(true)}
      />
    );
  }

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
