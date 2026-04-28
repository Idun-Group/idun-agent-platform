export type AgentSessionSummary = {
  id: string;
  lastUpdateTime: number | null;
  userId: string | null;
  threadId: string | null;
  preview: string | null;
};

export type AgentSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number | null;
};

export type AgentSessionDetail = {
  id: string;
  lastUpdateTime: number | null;
  userId: string | null;
  threadId: string | null;
  messages: AgentSessionMessage[];
};

export type HistoryCapabilities = {
  canList: boolean;
  canGet: boolean;
};

export type AgentCapabilities = {
  history?: HistoryCapabilities | null;
};
