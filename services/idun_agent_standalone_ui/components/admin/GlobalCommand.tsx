"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Activity,
  Cog,
  Database,
  Eye,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Plug,
  Puzzle,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/runtime-config";

type PageEntry = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PAGES: PageEntry[] = [
  { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/traces/", label: "Traces", icon: Activity },
  { href: "/logs/", label: "Logs", icon: FileText },
  { href: "/admin/agent/", label: "Configuration", icon: Cog },
  { href: "/admin/guardrails/", label: "Guardrails", icon: Shield },
  { href: "/admin/memory/", label: "Memory", icon: Database },
  { href: "/admin/mcp/", label: "MCP", icon: Plug },
  { href: "/admin/observability/", label: "Observability", icon: Eye },
  { href: "/admin/prompts/", label: "Prompts", icon: MessageSquare },
  { href: "/admin/integrations/", label: "Integrations", icon: Puzzle },
  { href: "/admin/settings/", label: "Settings", icon: SettingsIcon },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GlobalCommand({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { setTheme } = useTheme();

  // Recent traces — only fetched when the palette is open. Cached briefly so
  // re-opening within 30s reuses the same result.
  const { data: sessions } = useQuery({
    queryKey: ["sessions", "command", 10],
    queryFn: () =>
      api.listSessions({ limit: 10 }).catch(() => null),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: open,
  });

  const close = () => onOpenChange(false);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  // The reload endpoint lives on the engine itself (POST /reload). The
  // standalone backend gates it behind the same admin auth as the rest of
  // /admin, so we send credentials.
  const reloadConfig = async () => {
    close();
    try {
      const res = await fetch("/reload", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Configuration reloaded");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Reload failed: ${message}`);
    }
  };

  const signOut = async () => {
    close();
    try {
      await api.logout();
    } catch {
      // Even if logout fails, redirect — the cookie may already be gone.
    }
    window.location.href = "/login/";
  };

  const authMode =
    typeof window !== "undefined" ? getRuntimeConfig().authMode : "none";

  const recentTraces = sessions?.items ?? [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((p) => (
            <CommandItem
              key={p.href}
              value={`page ${p.label}`}
              onSelect={() => go(p.href)}
            >
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {recentTraces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent traces">
              {recentTraces.slice(0, 10).map((s) => {
                const label = s.title?.trim() || s.id.slice(0, 8);
                return (
                  <CommandItem
                    key={s.id}
                    value={`trace ${label} ${s.id}`}
                    onSelect={() =>
                      go(`/traces/session/?id=${encodeURIComponent(s.id)}`)
                    }
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="action reload configuration" onSelect={reloadConfig}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload configuration
          </CommandItem>
          <CommandItem
            value="action switch light theme"
            onSelect={() => {
              setTheme("light");
              close();
            }}
          >
            <Sun className="mr-2 h-4 w-4" />
            Switch to light theme
          </CommandItem>
          <CommandItem
            value="action switch dark theme"
            onSelect={() => {
              setTheme("dark");
              close();
            }}
          >
            <Moon className="mr-2 h-4 w-4" />
            Switch to dark theme
          </CommandItem>
          <CommandItem
            value="action switch system theme"
            onSelect={() => {
              setTheme("system");
              close();
            }}
          >
            <Monitor className="mr-2 h-4 w-4" />
            Switch to system theme
          </CommandItem>
          <CommandItem value="action open chat" onSelect={() => go("/")}>
            <Home className="mr-2 h-4 w-4" />
            Open chat
          </CommandItem>
          {authMode === "password" && (
            <CommandItem value="action sign out" onSelect={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
