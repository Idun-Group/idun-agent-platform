export type AgentStatus = "draft" | "live" | "disabled";

export type AgentRead = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  version: string | null;
  status: AgentStatus;
  baseUrl: string | null;
  baseEngineConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentPatch = {
  name?: string;
  description?: string | null;
  version?: string | null;
  status?: AgentStatus;
  baseUrl?: string | null;
  baseEngineConfig?: Record<string, unknown>;
};
