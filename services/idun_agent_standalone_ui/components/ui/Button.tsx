"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[var(--color-primary)] text-white hover:opacity-90",
  secondary:
    "bg-[var(--color-muted)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/40",
  ghost:
    "text-[var(--color-fg)]/80 hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)]",
  danger: "bg-red-500 text-white hover:bg-red-600",
};
const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
