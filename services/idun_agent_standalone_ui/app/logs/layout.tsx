"use client";

import { AuthGuard } from "@/components/admin/AuthGuard";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { Topbar } from "@/components/admin/Topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function LogsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Topbar />
          <main className="flex-1 overflow-hidden bg-background">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
