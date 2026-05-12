/**
 * Canonical event taxonomy. Every capture() call site must reference one of
 * these names. New events must be added here AND to:
 *   - services/idun_agent_standalone_ui/CLAUDE.md#telemetry
 *   - docs/observability/telemetry-events.mdx
 */

export const Events = {
  /** User started a login attempt (form submit or SSO redirect). Payload: AuthLoginStart. */
  AUTH_LOGIN_START: "auth.login.start",

  /** Login completed successfully (basic-auth response or OIDC callback). Payload: AuthLoginSuccess. */
  AUTH_LOGIN_SUCCESS: "auth.login.success",

  /** Login failed (network, server reject, or token-exchange error). Payload: AuthLoginFailure. */
  AUTH_LOGIN_FAILURE: "auth.login.failure",

  /** User logged out (any UI logout site). Payload: AuthLogout. */
  AUTH_LOGOUT: "auth.logout",

  /** Admin Save handler completed (any agent config section). Payload: AgentConfigSaved. */
  AGENT_CONFIG_SAVED: "agent.config.saved",

  /** Admin Reload button completed. Payload: AgentConfigReloaded. */
  AGENT_CONFIG_RELOADED: "agent.config.reloaded",

  /** Chat user message submitted to the agent. Payload: AgentRunStarted. */
  AGENT_RUN_STARTED: "agent.run.started",

  /** Stream RUN_FINISHED received. Payload: AgentRunCompleted. */
  AGENT_RUN_COMPLETED: "agent.run.completed",

  /** Stream errored before completion. Payload: AgentRunError. */
  AGENT_RUN_ERROR: "agent.run.error",

  /** User submitted a chat message (ChatInput). Payload: ChatMessageSent. */
  CHAT_MESSAGE_SENT: "chat.message.sent",

  /** First TEXT_MESSAGE_CONTENT delta received (TTFT marker). Payload: ChatResponseReceived. */
  CHAT_RESPONSE_RECEIVED: "chat.response.received",

  /** Client-side chat error toast displayed. Payload: ChatError. */
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
export type ChatError = {
  session_id: string;
  error_class: string;
  recoverable: boolean;
};
