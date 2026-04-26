import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning" | "success" | "danger" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  warning:
    "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  success:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

type Props = Omit<ComponentProps<typeof Badge>, "variant"> & { tone?: Tone };

/**
 * Compatibility wrapper that maps the legacy `tone` prop to the new shadcn
 * Badge component (which exposes `variant` instead). Keeps existing call sites
 * working while we migrate the rest of the UI.
 */
export function BadgeTone({ tone = "neutral", className, ...props }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASS[tone], className)}
      {...props}
    />
  );
}
