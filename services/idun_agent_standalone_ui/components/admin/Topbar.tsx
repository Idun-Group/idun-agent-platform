"use client";
import { Command as CommandIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "./Breadcrumbs";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function Topbar({ onOpenCommand }: { onOpenCommand?: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={onOpenCommand}
        >
          <CommandIcon className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Search…</span>
          <kbd className="ml-2 hidden md:inline rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
