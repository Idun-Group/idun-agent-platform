"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { BrandedLayout } from "@/components/chat/BrandedLayout";
import { MinimalLayout } from "@/components/chat/MinimalLayout";
import { InspectorLayout } from "@/components/chat/InspectorLayout";

function ChatHome() {
  const params = useSearchParams();
  const threadId = useMemo(
    () => params.get("session") ?? crypto.randomUUID(),
    [params],
  );
  const [layout, setLayout] = useState<"branded" | "minimal" | "inspector">(
    "branded",
  );

  useEffect(() => {
    setLayout(getRuntimeConfig().layout);
  }, []);

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
