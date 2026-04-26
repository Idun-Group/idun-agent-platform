"use client";

import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/admin/AppSidebar";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { GlobalCommand } from "@/components/admin/GlobalCommand";
import { Topbar } from "@/components/admin/Topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);

  // Global Cmd+K / Ctrl+K toggle. Bound once at the layout root so it's
  // available across every admin route without each page re-binding.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Topbar onOpenCommand={() => setCommandOpen(true)} />
          <main className="flex-1 overflow-y-auto bg-background">{children}</main>
        </SidebarInset>
        <GlobalCommand open={commandOpen} onOpenChange={setCommandOpen} />
      </SidebarProvider>
    </AuthGuard>
  );
}
