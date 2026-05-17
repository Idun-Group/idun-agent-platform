"use client";

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TopErrorRow } from "@/lib/api";

export function TopErrorsTable({ rows }: { rows: TopErrorRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No errors in this window.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Span name</TableHead>
          <TableHead className="w-20">Count</TableHead>
          <TableHead className="w-32">Last seen</TableHead>
          <TableHead className="w-32">Sample trace</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.spanName}>
            <TableCell className="font-mono text-xs">{r.spanName}</TableCell>
            <TableCell>{r.count}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {relativeTime(r.lastSeen)}
            </TableCell>
            <TableCell>
              <Link
                className="font-mono text-xs text-primary hover:underline"
                href={`/admin/traces/${r.sampleTraceId}`}
              >
                {r.sampleTraceId.slice(0, 8)}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
