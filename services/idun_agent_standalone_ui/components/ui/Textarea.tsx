import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] resize-y",
        "placeholder:text-[var(--color-fg)]/40",
        "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40",
        className,
      )}
      {...props}
    />
  );
});
