"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Code2,
  Cog,
  Database,
  ExternalLink,
  Eye,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plug,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { logoutWithTelemetry } from "@/lib/telemetry";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
  // Render as a plain ``<a>`` and force a hard browser navigation via
  // ``window.location.assign``. Use only when Next.js's client-side
  // router resolves the target URL incorrectly under ``output: "export"``
  // — e.g. ``/admin/traces/`` soft-navs sometimes mount the sibling
  // ``[traceId]`` route component instead of the explicit list page.
  // Follow-up: collide-free rename of the dynamic route (singular
  // ``/admin/trace/[traceId]/``) would let us drop this workaround.
  hardNav?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/traces/", label: "Traces", icon: Activity, hardNav: true },
    ],
  },
  {
    label: "Agent",
    items: [
      { href: "/admin/agent/", label: "Configuration", icon: Cog },
      { href: "/admin/guardrails/", label: "Guardrails", icon: Shield },
      { href: "/admin/memory/", label: "Memory", icon: Database },
      { href: "/admin/mcp/", label: "MCP", icon: Plug },
      { href: "/admin/observability/", label: "Observability", icon: Eye },
      { href: "/admin/prompts/", label: "Prompts", icon: MessageSquare },
      { href: "/admin/integrations/", label: "Integrations", icon: Puzzle },
      { href: "/admin/sso/", label: "SSO", icon: KeyRound },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings/", label: "Settings", icon: SettingsIcon },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/docs", label: "API Docs (Swagger)", icon: Code2, external: true },
      { href: "/redoc", label: "API Reference", icon: BookOpen, external: true },
    ],
  },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin/") {
    return pathname === "/admin/" || pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(href);
}

export function AppSidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [authMode, setAuthMode] = useState<string>("none");

  useEffect(() => {
    const cfg = getRuntimeConfig();
    setTheme(cfg.theme);
    setAuthMode(cfg.authMode);
  }, []);

  const handleLogout = async () => {
    // AppSidebar only renders the logout entry when authMode === "password",
    // so the method is always basic auth here.
    try {
      await logoutWithTelemetry("basic", () => api.logout());
    } catch {
      // Even if logout fails, redirect — cookie may already be gone.
    }
    window.location.href = "/login/";
  };

  const logoText = (theme?.logo.text ?? "IA").slice(0, 2).toUpperCase();
  const appName = theme?.appName ?? "Idun Agent";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {theme?.logo.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logo.imageUrl}
              alt={appName}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground font-serif text-xs font-medium text-background">
              {logoText}
            </span>
          )}
          <span className="truncate font-serif text-[14px] font-medium text-foreground group-data-[collapsible=icon]:hidden">
            {appName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel data-tour={group.label === "Agent" ? "sidebar-agent-group" : undefined}>
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.external ? false : isActive(pathname, item.href)}
                      tooltip={item.label}
                      data-tour={
                        item.href === "/admin/agent/"
                          ? "sidebar-agent-config"
                          : item.href === "/admin/observability/"
                          ? "sidebar-observability"
                          : undefined
                      }
                    >
                      {item.external ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          <span className="sr-only"> (opens in a new tab)</span>
                          <ExternalLink
                            className="ml-auto h-3 w-3 opacity-60"
                            aria-hidden="true"
                          />
                        </a>
                      ) : item.hardNav ? (
                        <a
                          href={item.href}
                          // Plain-click forces a hard nav. Cmd+Click /
                          // middle-click bypass ``onClick`` and use the
                          // ``href`` directly, which is the intended
                          // behavior (new tab also gets a hard nav).
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.assign(item.href);
                          }}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </a>
                      ) : (
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to chat">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {authMode === "password" && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Sign out">
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
