import type { ReactNode } from "react";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { Sidebar } from "@/components/admin/Sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="grid grid-cols-[12rem_1fr] h-screen bg-[var(--color-bg)]">
        <Sidebar />
        <main className="overflow-auto">{children}</main>
      </div>
    </AuthGuard>
  );
}
