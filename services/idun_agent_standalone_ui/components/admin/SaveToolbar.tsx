"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function SaveToolbar({
  title,
  dirty,
  busy,
  onRevert,
  onSave,
  extraActions,
}: {
  title: string;
  dirty: boolean;
  busy: boolean;
  onRevert: () => void;
  onSave: () => void;
  extraActions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <h2 className="font-semibold text-[var(--color-fg)]">{title}</h2>
      {dirty && <Badge tone="warning">● Unsaved</Badge>}
      <div className="ml-auto flex gap-2">
        {extraActions}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRevert}
          disabled={!dirty || busy}
        >
          Revert
        </Button>
        <Button size="sm" onClick={onSave} disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save & reload"}
        </Button>
      </div>
    </div>
  );
}
