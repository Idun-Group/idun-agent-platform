import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)]",
          "placeholder:text-[var(--color-fg)]/40",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40",
          className,
        )}
        {...props}
      />
    );
  },
);
