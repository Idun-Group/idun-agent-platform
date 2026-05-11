"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SecretInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type"
>;

export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  function SecretInput(
    { className, autoComplete, spellCheck, id, disabled, ...props },
    ref,
  ) {
    const [revealed, setRevealed] = React.useState(false);
    const Icon = revealed ? EyeOff : Eye;
    const label = revealed ? "Hide secret" : "Show secret";
    // Stable id so the toggle button can target the input via aria-controls.
    // Honor an explicit id from the caller, otherwise derive one.
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    // Don't let the user reveal a disabled input — a disabled field can
    // still leak its value if the toggle stays interactive.
    const toggleInteractive = !disabled;

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          id={inputId}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete ?? "off"}
          spellCheck={spellCheck ?? false}
          disabled={disabled}
          className={cn("pr-9", className)}
        />
        <button
          type="button"
          aria-label={label}
          aria-pressed={revealed}
          aria-controls={inputId}
          aria-disabled={disabled || undefined}
          disabled={!toggleInteractive}
          tabIndex={toggleInteractive ? 0 : -1}
          onClick={() => {
            if (!toggleInteractive) return;
            setRevealed((v) => !v);
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  },
);
