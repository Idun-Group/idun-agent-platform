export type AgentFramework =
  | "LANGGRAPH"
  | "ADK"
  | "CREWAI"
  | "HAYSTACK"
  | "CUSTOM"
  | "TRANSLATION_AGENT"
  | "CORRECTION_AGENT"
  | "DEEP_RESEARCH_AGENT";

export type MemoryRead = {
  agentFramework: AgentFramework;
  memory: Record<string, unknown>;
  updatedAt: string;
};

export type MemoryPatch = {
  agentFramework?: AgentFramework;
  memory?: Record<string, unknown>;
};
