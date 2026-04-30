"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { AgentRead, Framework } from "@/lib/api";

const AgentGraph = dynamic(
  () => import("@/components/graph/AgentGraph").then((m) => m.AgentGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-md bg-muted" />
    ),
  },
);

type Mode = "starter" | "detection";

interface WizardDoneProps {
  agent: AgentRead;
  framework: Framework;
  mode: Mode;
  onGoToChat: () => void;
}

function envReminder(framework: Framework, mode: Mode): ReactNode {
  if (mode === "detection") {
    return "Make sure your agent's environment variables are set before chatting.";
  }
  const envVar = framework === "LANGGRAPH" ? "OPENAI_API_KEY" : "GOOGLE_API_KEY";
  return (
    <>
      Set <code>{envVar}</code> in your environment before chatting. Copy{" "}
      <code>.env.example</code> to <code>.env</code> and fill it in, then
      restart <code>idun-standalone</code>.
    </>
  );
}

export function WizardDone({
  agent,
  framework,
  mode,
  onGoToChat,
}: WizardDoneProps) {
  const graphQuery = useQuery({
    queryKey: ["agent-graph"],
    queryFn: () => api.getAgentGraph(),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  return (
    <div className="w-full max-w-lg space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{agent.name} is ready</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Framework</span>
              <Badge variant="secondary">{framework}</Badge>
            </div>
          </div>
          <Alert>
            <AlertTitle>Set up your model credentials</AlertTitle>
            <AlertDescription>{envReminder(framework, mode)}</AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onGoToChat}>Go to chat</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Your agent</CardTitle>
        </CardHeader>
        <CardContent>
          {graphQuery.isLoading && (
            <div className="h-[420px] animate-pulse rounded-md bg-muted" />
          )}
          {graphQuery.isError &&
            graphQuery.error instanceof ApiError &&
            graphQuery.error.status === 404 && (
              <p className="text-sm text-muted-foreground">
                Graph view isn&apos;t available for this agent type yet.
              </p>
            )}
          {graphQuery.isError &&
            !(
              graphQuery.error instanceof ApiError &&
              graphQuery.error.status === 404
            ) && (
              <Alert>
                <AlertTitle>Graph unavailable</AlertTitle>
                <AlertDescription>Try reloading the page.</AlertDescription>
              </Alert>
            )}
          {graphQuery.data && <AgentGraph graph={graphQuery.data} />}
        </CardContent>
      </Card>
    </div>
  );
}
