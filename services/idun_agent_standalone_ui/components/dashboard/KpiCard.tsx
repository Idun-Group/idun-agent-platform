"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface KpiCardProps {
  label: string;
  value?: string | number;
  deltaLabel?: string | null;
  deltaDirection?: "up" | "down" | "neutral";
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  deltaLabel,
  deltaDirection = "neutral",
  loading,
}: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <Skeleton className="h-8 w-24" data-testid="kpi-skeleton" />
        ) : (
          <div className="font-serif text-2xl text-foreground">{value}</div>
        )}
        {deltaLabel && (
          <p
            className={cn(
              "text-xs",
              deltaDirection === "up" && "text-emerald-600",
              deltaDirection === "down" && "text-red-600",
              deltaDirection === "neutral" && "text-muted-foreground",
            )}
          >
            {deltaLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
