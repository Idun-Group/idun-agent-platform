import type { AgentRead } from "./agent";

export type OnboardingState =
  | "EMPTY"
  | "NO_SUPPORTED"
  | "ONE_DETECTED"
  | "MANY_DETECTED"
  | "ALREADY_CONFIGURED";

export type Framework = "LANGGRAPH" | "ADK";
export type DetectionConfidence = "HIGH" | "MEDIUM";
export type DetectionSource = "config" | "source" | "langgraph_json";

export interface DetectedAgent {
  framework: Framework;
  filePath: string;
  variableName: string;
  inferredName: string;
  confidence: DetectionConfidence;
  source: DetectionSource;
}

export interface ScanResult {
  root: string;
  detected: DetectedAgent[];
  hasPythonFiles: boolean;
  hasIdunConfig: boolean;
  scanDurationMs: number;
}

export interface ScanResponse {
  state: OnboardingState;
  scanResult: ScanResult;
  currentAgent: AgentRead | null;
}

export interface CreateFromDetectionBody {
  framework: Framework;
  filePath: string;
  variableName: string;
}

export interface CreateStarterBody {
  framework: Framework;
  name?: string;
}
