"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DetectedAgent } from "@/lib/api";
import { DetectionRow } from "./DetectionRow";

interface WizardOneDetectedProps {
  detection: DetectedAgent;
  onConfirm: (detection: DetectedAgent) => void;
  onRescan: () => void;
}

export function WizardOneDetected({
  detection,
  onConfirm,
  onRescan,
}: WizardOneDetectedProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Found your agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We detected one agent in this folder.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-border p-4">
          <DetectionRow detection={detection} large />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRescan}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Re-scan
          </button>
          <Button onClick={() => onConfirm(detection)}>Use this agent</Button>
        </div>
      </CardContent>
    </Card>
  );
}
