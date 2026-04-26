import { Badge } from "@/components/ui/badge";

type Props = { variant?: "mocked" | "preview" };

export function ComingSoonBadge({ variant = "mocked" }: Props) {
  const text =
    variant === "mocked"
      ? "Coming soon — mocked data"
      : "Preview — available in MVP-2";
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
    >
      {text}
    </Badge>
  );
}
