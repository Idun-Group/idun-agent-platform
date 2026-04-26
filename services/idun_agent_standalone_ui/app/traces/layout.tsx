"use client";

import { AuthGuard } from "@/components/admin/AuthGuard";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { Topbar } from "@/components/admin/Topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function TracesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* AppSidebar items use SidebarMenuButton with `tooltip`, which wraps
          its trigger in a Radix Tooltip — provide a TooltipProvider here. */}
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Topbar />
            <main className="flex-1 overflow-hidden bg-background">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AuthGuard>
  );
}
