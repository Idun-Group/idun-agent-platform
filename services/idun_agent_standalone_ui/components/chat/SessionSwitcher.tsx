"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function SessionSwitcher({ threadId }: { threadId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const newSession = () => {
    const id = crypto.randomUUID();
    const qp = new URLSearchParams(params.toString());
    qp.set("session", id);
    router.push(`/?${qp.toString()}`);
  };
  return (
    <div className="flex items-center gap-2 text-xs opacity-80">
      <span className="font-mono">{threadId.slice(0, 8)}</span>
      <Button size="sm" variant="ghost" onClick={newSession}>
        New
      </Button>
    </div>
  );
}
