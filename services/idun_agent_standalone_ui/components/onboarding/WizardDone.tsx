"use client";

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

function envReminder(framework: Framework, mode: Mode): string {
  if (mode === "detection") {
    return "Make sure your agent's environment variables are set before chatting.";
  }
  if (framework === "LANGGRAPH") {
    return "Set `OPENAI_API_KEY` in your environment before chatting. Copy `.env.example` to `.env` and fill it in, then restart `idun-standalone`.";
  }
  return "Set `GOOGLE_API_KEY` in your environment before chatting. Copy `.env.example` to `.env` and fill it in, then restart `idun-standalone`.";
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
