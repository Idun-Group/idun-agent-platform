"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type ProviderOption<T extends string = string> = {
  id: T;
  label: string;
  description?: string;
  icon: React.ReactNode;
  badge?: string;
};

type ProviderPickerProps<T extends string = string> = {
  value: T;
  onChange: (id: T) => void;
  options: ProviderOption<T>[];
  columns?: 2 | 3 | 4;
  className?: string;
};

export function ProviderPicker<T extends string = string>({
  value,
  onChange,
  options,
  columns = 3,
  className,
}: ProviderPickerProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              "hover:border-foreground/30 hover:bg-foreground/[0.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
              selected
                ? "border-emerald-500/60 bg-emerald-500/[0.08] ring-2 ring-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                : "border-foreground/10 bg-card",
            )}
          >
            <div className="shrink-0">{opt.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-medium",
                    selected
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-foreground",
                  )}
                >
                  {opt.label}
                </span>
                {opt.badge && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {opt.badge}
                  </span>
                )}
              </div>
              {opt.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {opt.description}
                </p>
              )}
            </div>
            {selected && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
