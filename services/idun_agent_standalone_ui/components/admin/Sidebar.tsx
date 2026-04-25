"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/", label: "Dashboard" },
      { href: "/traces/", label: "Traces" },
      { href: "/logs/", label: "Logs" },
    ],
  },
  {
    label: "Agent",
    items: [
      { href: "/admin/agent/", label: "Configuration" },
      { href: "/admin/guardrails/", label: "Guardrails" },
      { href: "/admin/memory/", label: "Memory" },
      { href: "/admin/mcp/", label: "MCP" },
      { href: "/admin/observability/", label: "Observability" },
      { href: "/admin/prompts/", label: "Prompts" },
      { href: "/admin/integrations/", label: "Integrations" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/settings/", label: "Settings" }],
  },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/admin/") return pathname === "/admin/" || pathname === "/admin";
  return pathname === href || pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-48 border-r border-[var(--color-border)] p-3 flex flex-col gap-1 text-sm bg-[var(--color-muted)]/40">
      <div className="px-2 mb-3 flex items-center gap-2">
        <span className="h-5 w-5 rounded bg-[var(--color-primary)]" />
        <strong>Idun Standalone</strong>
      </div>
      {GROUPS.map((g) => (
        <div key={g.label} className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg)]/50 px-2 mb-1">
            {g.label}
          </div>
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "block px-2 py-1 rounded transition-colors",
                isActive(pathname, it.href)
                  ? "bg-[var(--color-muted)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg)]/70 hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-fg)]",
              )}
            >
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
