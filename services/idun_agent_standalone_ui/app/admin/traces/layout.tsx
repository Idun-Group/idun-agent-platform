// Pass-through layout. The parent /admin/layout.tsx already wires
// AuthGuard, SidebarProvider, Topbar, and the global command palette;
// this file exists so /admin/traces/* can grow its own segment-scoped
// layout (e.g. shared filter chrome) without touching the parent.
export default function TracesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
