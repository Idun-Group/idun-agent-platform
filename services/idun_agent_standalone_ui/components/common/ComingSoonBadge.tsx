import { Badge } from "@/components/ui/Badge";

type Props = { variant?: "mocked" | "preview" };

export function ComingSoonBadge({ variant = "mocked" }: Props) {
  const text =
    variant === "mocked"
      ? "Coming soon — mocked data"
      : "Preview — available in MVP-2";
  return <Badge tone="warning">{text}</Badge>;
}
