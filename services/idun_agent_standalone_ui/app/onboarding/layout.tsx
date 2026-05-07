import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4">
        <span className="text-sm font-semibold text-foreground">Idun</span>
      </header>
      <main className="flex-1 grid place-items-center px-6 pb-12">
        {children}
      </main>
    </div>
  );
}
