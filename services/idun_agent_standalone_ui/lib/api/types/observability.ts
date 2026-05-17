export type ObservabilityProvider =
  | "LANGFUSE"
  | "PHOENIX"
  | "GCP_LOGGING"
  | "GCP_TRACE"
  | "LANGSMITH";

export type ObservabilityConfig = {
  provider: ObservabilityProvider;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type ObservabilityRead = {
  observability: ObservabilityConfig;
  updatedAt: string;
};

export type ObservabilityPatch = {
  observability?: ObservabilityConfig;
};
