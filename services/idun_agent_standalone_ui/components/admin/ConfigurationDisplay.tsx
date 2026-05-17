"use client";

import Link from "next/link";

import { AdkIcon, LangGraphIcon } from "@/components/admin/provider-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgentRead } from "@/lib/api";

type Framework = "langgraph" | "adk";

function readFramework(agent: AgentRead): Framework {
  const t = (agent.baseEngineConfig?.agent as { type?: string } | undefined)
    ?.type;
  return t === "ADK" ? "adk" : "langgraph";
}

function readDefinition(agent: AgentRead, framework: Framework): string {
  const cfg = ((agent.baseEngineConfig?.agent as { config?: Record<string, unknown> })
    ?.config ?? {}) as Record<string, unknown>;
  const key = framework === "adk" ? "agent" : "graph_definition";
  const v = cfg[key];
  return typeof v === "string" ? v : "";
}

export function ConfigurationDisplay({ agent }: { agent: AgentRead }) {
  const framework = readFramework(agent);
  const definition = readDefinition(agent, framework);
  const Icon = framework === "adk" ? AdkIcon : LangGraphIcon;
  const label = framework === "adk" ? "ADK" : "LangGraph";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Identity and graph definition for the running agent.
          </CardDescription>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/agent">Edit →</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon size={28} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <Row label="Name" value={agent.name} />
        {agent.description && <Row label="Description" value={agent.description} />}
        <Row
          label={framework === "adk" ? "Agent definition" : "Graph definition"}
          value={definition}
          mono
        />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={mono ? "font-mono text-sm" : "text-sm"}>{value}</span>
    </div>
  );
}
