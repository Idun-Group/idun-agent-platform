"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { SessionSwitcher } from "./SessionSwitcher";

/**
 * Trailing actions in every chat header — session switcher + a link to the
 * admin panel. The admin link uses /admin/ (with trailing slash) so the
 * static-export router lands on the correct directory route.
 */
export function HeaderActions({
  threadId,
  tone = "default",
}: {
  threadId: string;
  tone?: "default" | "onPrimary";
}) {
  const adminClass =
    tone === "onPrimary"
      ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-white/15 hover:bg-white/25 text-white"
      : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-fg)]/80";

  return (
    <div className="flex items-center gap-3">
      <SessionSwitcher threadId={threadId} />
      <Link href="/admin/" className={adminClass} aria-label="Open admin panel">
        <Settings size={12} />
        Admin
      </Link>
    </div>
  );
}
