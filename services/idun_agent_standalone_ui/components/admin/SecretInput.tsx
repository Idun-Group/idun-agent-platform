"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SecretInputProps = Omit<
  React.ComponentProps<"input">,
  "type"
>;

export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  function SecretInput({ className, autoComplete, spellCheck, ...props }, ref) {
    const [revealed, setRevealed] = React.useState(false);
    const Icon = revealed ? EyeOff : Eye;
    const label = revealed ? "Hide secret" : "Show secret";

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete ?? "off"}
          spellCheck={spellCheck ?? false}
          className={cn("pr-9", className)}
        />
        <button
          type="button"
          aria-label={label}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  },
);
