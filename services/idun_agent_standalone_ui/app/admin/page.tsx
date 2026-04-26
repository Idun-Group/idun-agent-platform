"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clock,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

type Kpi = {
  label: string;
  value: string | number | null;
  delta?: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

export default function DashboardPage() {
  // Existing pattern — preserve it. There is no dedicated dashboard summary
  // endpoint, so derive KPIs from the sessions list and badge the metrics
  // that aren't yet wired (latency, errors).
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["dashboard", "sessions"],
    queryFn: () => api.listSessions({ limit: 25 }).catch(() => null),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const sessionsToday = useMemo(() => {
    if (!sessions?.items) return null;
    const dayAgo = Date.now() - 86_400_000;
    return sessions.items.filter(
      (s) => new Date(s.last_event_at).getTime() >= dayAgo,
    ).length;
  }, [sessions]);

  const kpis: Kpi[] = [
    { label: "Sessions today", value: sessionsToday ?? 0, icon: MessageSquare },
    {
      label: "Total runs",
      value: sessions?.items?.length ?? 0,
      icon: Activity,
    },
    { label: "Avg latency", value: null, icon: Clock, comingSoon: true },
    { label: "Errors", value: null, icon: AlertCircle, comingSoon: true },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <header>
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of your standalone agent.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {k.comingSoon ? (
                <ComingSoonBadge variant="preview" />
              ) : isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-serif text-foreground">
                  {k.value}
                </div>
              )}
              {k.delta && (
                <p className="text-xs text-muted-foreground mt-1">{k.delta}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest chat sessions.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/traces/">
              View all
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !sessions?.items?.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sessions yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.items.slice(0, 8).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {s.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.title || (
                        <span className="text-muted-foreground">Untitled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeTime(s.last_event_at)}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/traces/session/?id=${encodeURIComponent(s.id)}`}
                        >
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}
