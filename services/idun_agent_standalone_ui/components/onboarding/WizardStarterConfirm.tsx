"use client";

import { useState } from "react";
import { File } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Framework } from "@/lib/api";

const STARTER_FILES = [
  "agent.py",
  "requirements.txt",
  ".env.example",
  "README.md",
  ".gitignore",
];

interface WizardStarterConfirmProps {
  framework: Framework;
  onConfirm: (input: { framework: Framework; name?: string }) => void;
  onBack: () => void;
  onRescan: () => void;
}

export function WizardStarterConfirm({
  framework,
  onConfirm,
  onBack,
  onRescan,
}: WizardStarterConfirmProps) {
  const [name, setName] = useState("");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Confirm your starter</CardTitle>
        <p className="text-sm text-muted-foreground">
          We'll create the following files in your project:
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-2">
          {STARTER_FILES.map((filename) => (
            <li key={filename} className="flex items-center gap-2 text-sm">
              <File className="h-4 w-4 text-muted-foreground" />
              <code className="font-mono text-xs">{filename}</code>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <Label htmlFor="agent-name" className="text-xs text-muted-foreground">
            Agent name (optional)
          </Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Starter Agent"
            maxLength={80}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onRescan}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Re-scan
            </button>
          </div>
          <Button
            onClick={() => {
              const trimmed = name.trim();
              onConfirm(
                trimmed ? { framework, name: trimmed } : { framework },
              );
            }}
          >
            Create starter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
