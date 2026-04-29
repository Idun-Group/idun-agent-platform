"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cog,
  Database,
  Eye,
  FileText,
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

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/traces/", label: "Traces", icon: Activity },
      { href: "/logs/", label: "Logs", icon: FileText },
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
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings/", label: "Settings", icon: SettingsIcon },
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
    try {
      await api.logout();
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
                      isActive={isActive(pathname, item.href)}
                      tooltip={item.label}
                      data-tour={
                        item.href === "/admin/agent/"
                          ? "sidebar-agent-config"
                          : item.href === "/admin/observability/"
                          ? "sidebar-observability"
                          : undefined
                      }
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
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
