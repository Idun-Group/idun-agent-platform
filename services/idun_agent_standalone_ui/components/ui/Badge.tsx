import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning" | "success" | "danger" | "info";
const TONE: Record<Tone, string> = {
  neutral:
    "bg-[var(--color-muted)] text-[var(--color-fg)]/80 border-[var(--color-border)]",
  warning: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  danger: "bg-red-500/15 text-red-600 border-red-500/30",
  info: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
};

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: Tone };

export function Badge({ className, tone = "neutral", ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
