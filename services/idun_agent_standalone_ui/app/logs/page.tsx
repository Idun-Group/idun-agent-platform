"use client";

import { Filter, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as const;
type Level = (typeof LEVELS)[number];

type LogRow = {
  timestamp: string;
  level: Level;
  message: string;
};

// Mocked tail until the backend exposes /admin/api/v1/logs (MVP-2).
const FAKE_LOGS: LogRow[] = [
  {
    timestamp: "11:04:12",
    level: "INFO",
    message: "agent.run RunStarted run_id=run_0001 thread=sess_a1f7e0c3",
  },
  {
    timestamp: "11:04:12",
    level: "DEBUG",
    message: "langgraph.node node=router → tool_call",
  },
  {
    timestamp: "11:04:12",
    level: "INFO",
    message: "tools.lookup_order invoked order_id=4482",
  },
  {
    timestamp: "11:04:12",
    level: "INFO",
    message: "tools.lookup_order ok duration=182ms status=shipped",
  },
  {
    timestamp: "11:04:13",
    level: "INFO",
    message: "llm.openai completion model=gpt-4o tokens=812 duration=1.2s",
  },
  {
    timestamp: "11:04:13",
    level: "INFO",
    message: "agent.run RunFinished total=1.7s",
  },
  {
    timestamp: "11:04:47",
    level: "INFO",
    message: "agent.run RunStarted run_id=run_0002",
  },
  {
    timestamp: "11:04:47",
    level: "WARNING",
    message:
      "guardrails.pii input contains possible email masked=j***@e****.com",
  },
  {
    timestamp: "11:04:47",
    level: "INFO",
    message: "tools.send_tracking invoked order_id=4482",
  },
  {
    timestamp: "11:04:47",
    level: "ERROR",
    message: "mcp.time-server connection refused retries=2 next=5s",
  },
  {
    timestamp: "11:04:48",
    level: "INFO",
    message: "agent.run RunFinished total=1.0s",
  },
];

function LevelBadge({ level }: { level: Level }) {
  switch (level) {
    case "DEBUG":
      return <Badge variant="outline">{level}</Badge>;
    case "INFO":
      return <Badge variant="secondary">{level}</Badge>;
    case "WARNING":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
        >
          {level}
        </Badge>
      );
    case "ERROR":
    case "CRITICAL":
      return <Badge variant="destructive">{level}</Badge>;
    default:
      return <Badge variant="outline">{level}</Badge>;
  }
}

export default function LogsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Level[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return FAKE_LOGS.filter((row) => {
      if (selectedLevels.length > 0 && !selectedLevels.includes(row.level)) {
        return false;
      }
      if (q && !row.message.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [searchInput, selectedLevels]);

  // Scroll the log scroller to the bottom whenever new entries arrive while
  // auto-scroll is on. The ref points at the overflow container, not at the
  // table itself, so we drive scrollTop on the container directly.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-medium text-foreground">
            Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Live tail of recent events.
          </p>
        </div>
        <ComingSoonBadge />
      </header>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Filter…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              type="search"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-3.5 w-3.5" />
                Levels
                {selectedLevels.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedLevels.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LEVELS.map((lvl) => {
                const checked = selectedLevels.includes(lvl);
                return (
                  <DropdownMenuCheckboxItem
                    key={lvl}
                    checked={checked}
                    onCheckedChange={(value) =>
                      setSelectedLevels((prev) =>
                        value
                          ? [...prev.filter((x) => x !== lvl), lvl]
                          : prev.filter((x) => x !== lvl),
                      )
                    }
                  >
                    {lvl}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Switch
              id="logs-autoscroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
            />
            <Label htmlFor="logs-autoscroll">Auto-scroll</Label>
          </div>
        </CardHeader>
        <CardContent ref={scrollRef} className="flex-1 overflow-auto p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No log entries match the current filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Time</TableHead>
                  <TableHead className="w-24">Level</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, i) => (
                  <TableRow key={`${row.timestamp}-${i}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.timestamp}
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={row.level} />
                    </TableCell>
                    <TableCell className="break-all whitespace-pre-wrap font-mono text-xs">
                      {row.message}
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
