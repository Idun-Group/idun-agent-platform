/**
 * Canonical event taxonomy. Every capture() call site must reference one of
 * these names. New events must be added here AND to:
 *   - services/idun_agent_standalone_ui/CLAUDE.md#telemetry
 *   - docs/observability/telemetry-events.mdx
 */

export const Events = {
  AUTH_LOGIN_START: "auth.login.start",
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILURE: "auth.login.failure",
  AUTH_LOGOUT: "auth.logout",
  AGENT_CONFIG_SAVED: "agent.config.saved",
  AGENT_CONFIG_RELOADED: "agent.config.reloaded",
  AGENT_RUN_STARTED: "agent.run.started",
  AGENT_RUN_COMPLETED: "agent.run.completed",
  AGENT_RUN_ERROR: "agent.run.error",
  CHAT_MESSAGE_SENT: "chat.message.sent",
  CHAT_RESPONSE_RECEIVED: "chat.response.received",
  CHAT_MESSAGE_RETRIED: "chat.message.retried",
  CHAT_ERROR: "chat.error",
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

export type AuthLoginStart = { method: "oidc" | "basic"; provider?: string };
export type AuthLoginSuccess = AuthLoginStart & { duration_ms: number };
export type AuthLoginFailure = AuthLoginStart & {
  duration_ms: number;
  error_class: string;
};
export type AuthLogout = { method: "oidc" | "basic" };

export type ConfigSection =
  | "framework"
  | "guardrails"
  | "mcp"
  | "prompts"
  | "integrations"
  | "memory";

export type AgentConfigSaved = {
  agent_id: string;
  section: ConfigSection;
  duration_ms: number;
  result: "ok" | "validation_error" | "server_error";
};
export type AgentConfigReloaded = {
  agent_id: string;
  duration_ms: number;
  result: AgentConfigSaved["result"];
};

export type AgentRunStarted = {
  agent_id: string;
  session_id: string;
  message_index: number;
};
export type AgentRunCompleted = {
  agent_id: string;
  session_id: string;
  duration_ms: number;
  tokens_in?: number;
  tokens_out?: number;
};
export type AgentRunError = {
  agent_id: string;
  session_id: string;
  error_class: string;
  duration_ms: number;
};

export type ChatMessageSent = {
  session_id: string;
  length_chars: number;
  length_words: number;
};
export type ChatResponseReceived = {
  session_id: string;
  time_to_first_token_ms: number;
};
export type ChatMessageRetried = { session_id: string; attempt_number: number };
export type ChatError = {
  session_id: string;
  error_class: string;
  recoverable: boolean;
};
