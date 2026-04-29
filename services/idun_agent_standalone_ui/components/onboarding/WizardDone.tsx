"use client";

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
import type { AgentRead, Framework } from "@/lib/api";

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
  return (
    <Card className="w-full max-w-lg">
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
  );
}
