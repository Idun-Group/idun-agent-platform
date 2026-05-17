import { Badge } from "@/components/ui/badge";
import type { DetectedAgent } from "@/lib/api";

interface DetectionRowProps {
  detection: DetectedAgent;
  large?: boolean;
}

export function DetectionRow({ detection, large = false }: DetectionRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{detection.framework}</Badge>
        <span className={large ? "text-base font-medium" : "text-sm font-medium"}>
          {detection.inferredName}
        </span>
        {detection.confidence === "MEDIUM" && (
          <Badge variant="outline" className="text-xs">
            Medium confidence
          </Badge>
        )}
      </div>
      <code className="text-xs text-muted-foreground font-mono">
        {detection.filePath}:{detection.variableName}
      </code>
    </div>
  );
}
