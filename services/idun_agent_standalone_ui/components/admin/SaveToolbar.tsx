"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background">
      <h2 className="font-semibold text-foreground">{title}</h2>
      {dirty && (
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
        >
          ● Unsaved
        </Badge>
      )}
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
