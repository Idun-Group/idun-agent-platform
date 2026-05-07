"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Framework } from "@/lib/api";

interface FrameworkPickerProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function FrameworkPicker({ onContinue, onRescan }: FrameworkPickerProps) {
  const [selected, setSelected] = useState<Framework | "">("");

  return (
    <div className="space-y-6">
      <RadioGroup
        value={selected}
        onValueChange={(value) => setSelected(value as Framework)}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3 rounded-md border border-border p-4">
          <RadioGroupItem value="LANGGRAPH" id="fw-langgraph" />
          <div className="flex-1">
            <Label htmlFor="fw-langgraph" className="flex items-center gap-2">
              LangGraph
              <Badge variant="secondary">Recommended</Badge>
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              StateGraph-based agents from the LangGraph Python SDK.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3 rounded-md border border-border p-4">
          <RadioGroupItem value="ADK" id="fw-adk" />
          <div className="flex-1">
            <Label htmlFor="fw-adk">Google ADK</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Google Agent Development Kit (Gemini-based).
            </p>
          </div>
        </div>
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
          onClick={() => selected && onContinue(selected)}
          disabled={!selected}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
