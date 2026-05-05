"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DetectedAgent } from "@/lib/api";
import { DetectionRow } from "./DetectionRow";

interface WizardManyDetectedProps {
  detections: DetectedAgent[];
  onConfirm: (detection: DetectedAgent) => void;
  onRescan: () => void;
}

const CONFIDENCE_RANK: Record<DetectedAgent["confidence"], number> = {
  HIGH: 0,
  MEDIUM: 1,
};
const FRAMEWORK_RANK: Record<DetectedAgent["framework"], number> = {
  LANGGRAPH: 0,
  ADK: 1,
};

export function WizardManyDetected({
  detections,
  onConfirm,
  onRescan,
}: WizardManyDetectedProps) {
  const { sorted, byKey } = useMemo(() => {
    const sorted = [...detections].sort((a, b) => {
      const c = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
      if (c !== 0) return c;
      const f = FRAMEWORK_RANK[a.framework] - FRAMEWORK_RANK[b.framework];
      if (f !== 0) return f;
      return a.inferredName.localeCompare(b.inferredName);
    });
    const byKey = new Map<string, DetectedAgent>(
      sorted.map((d) => [`${d.filePath}:${d.variableName}`, d]),
    );
    return { sorted, byKey };
  }, [detections]);
  const [selectedKey, setSelectedKey] = useState<string>("");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Pick your agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We found {sorted.length} agents in this folder. Choose one — Idun runs
          one agent per install.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={selectedKey}
          onValueChange={setSelectedKey}
          className="space-y-3"
        >
          {sorted.map((d) => {
            const key = `${d.filePath}:${d.variableName}`;
            return (
              <div
                key={key}
                className="flex items-start space-x-3 rounded-md border border-border p-4"
              >
                <RadioGroupItem value={key} id={`det-${key}`} />
                <Label htmlFor={`det-${key}`} className="flex-1 cursor-pointer">
                  <DetectionRow detection={d} />
                </Label>
              </div>
            );
          })}
        </RadioGroup>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRescan}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Re-scan
          </button>
          <Button
            onClick={() => {
              const detection = byKey.get(selectedKey);
              if (detection) {
                onConfirm(detection);
              }
            }}
            disabled={selectedKey === ""}
          >
            Use selected agent
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
