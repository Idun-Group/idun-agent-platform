"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

const LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Configuration",
  guardrails: "Guardrails",
  memory: "Memory",
  mcp: "MCP",
  observability: "Observability",
  prompts: "Prompts",
  integrations: "Integrations",
  sso: "SSO",
  settings: "Settings",
  traces: "Traces",
  logs: "Logs",
  session: "Session",
};

function labelFor(seg: string): string {
  return LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? "";
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segs.map((seg, i) => {
          const href = "/" + segs.slice(0, i + 1).join("/") + "/";
          const isLast = i === segs.length - 1;
          return (
            <React.Fragment key={href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{labelFor(seg)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{labelFor(seg)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
