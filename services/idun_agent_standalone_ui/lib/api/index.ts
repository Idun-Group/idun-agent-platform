/**
 * Typed wrappers for /admin/api/v1/* and engine-backed session endpoints.
 *
 * Mutating admin endpoints return MutationResponse<T> = { data, reload };
 * callers should surface reload.status (reloaded / restart_required /
 * reload_failed) so the operator knows whether the change went live.
 */

import { apiFetch, j } from "./client";
import type {
  AgentCapabilities,
  AgentPatch,
  AgentRead,
  AgentSessionDetail,
  AgentSessionSummary,
  CreateFromDetectionBody,
  CreateStarterBody,
  DeleteResult,
  GuardrailCreate,
  GuardrailPatch,
  GuardrailRead,
  IntegrationCreate,
  IntegrationPatch,
  IntegrationRead,
  McpCreate,
  McpPatch,
  McpRead,
  MemoryPatch,
  MemoryRead,
  MutationResponse,
  ObservabilityPatch,
  ObservabilityRead,
  PromptCreate,
  PromptPatch,
  PromptRead,
  ScanResponse,
  SingletonDeleteResult,
} from "./types";

export { ApiError } from "./client";
export * from "./types";

const ADMIN = "/admin/api/v1";

export const api = {
  // auth (strict-minimum password mode)
  me: () =>
    apiFetch<{ authenticated: boolean; authMode: string }>(`${ADMIN}/auth/me`),
  login: (password: string) =>
    apiFetch<{ ok: boolean }>(`${ADMIN}/auth/login`, {
      method: "POST",
      body: j({ password }),
    }),
  logout: () =>
    apiFetch<{ ok: boolean }>(`${ADMIN}/auth/logout`, { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(`${ADMIN}/auth/change-password`, {
      method: "POST",
      body: j({ currentPassword, newPassword }),
    }),

  // agent (singleton)
  getAgent: () => apiFetch<AgentRead>(`${ADMIN}/agent`),
  patchAgent: (body: AgentPatch) =>
    apiFetch<MutationResponse<AgentRead>>(`${ADMIN}/agent`, {
      method: "PATCH",
      body: j(body),
    }),

  // memory (singleton)
  getMemory: () => apiFetch<MemoryRead | null>(`${ADMIN}/memory`),
  patchMemory: (body: MemoryPatch) =>
    apiFetch<MutationResponse<MemoryRead>>(`${ADMIN}/memory`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteMemory: () =>
    apiFetch<MutationResponse<SingletonDeleteResult>>(`${ADMIN}/memory`, {
      method: "DELETE",
    }),

  // observability (singleton)
  getObservability: () =>
    apiFetch<ObservabilityRead | null>(`${ADMIN}/observability`),
  patchObservability: (body: ObservabilityPatch) =>
    apiFetch<MutationResponse<ObservabilityRead>>(`${ADMIN}/observability`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteObservability: () =>
    apiFetch<MutationResponse<SingletonDeleteResult>>(
      `${ADMIN}/observability`,
      { method: "DELETE" },
    ),

  // mcp servers (collection)
  listMcp: () => apiFetch<McpRead[]>(`${ADMIN}/mcp-servers`),
  getMcp: (id: string) => apiFetch<McpRead>(`${ADMIN}/mcp-servers/${id}`),
  createMcp: (body: McpCreate) =>
    apiFetch<MutationResponse<McpRead>>(`${ADMIN}/mcp-servers`, {
      method: "POST",
      body: j(body),
    }),
  patchMcp: (id: string, body: McpPatch) =>
    apiFetch<MutationResponse<McpRead>>(`${ADMIN}/mcp-servers/${id}`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteMcp: (id: string) =>
    apiFetch<MutationResponse<DeleteResult>>(`${ADMIN}/mcp-servers/${id}`, {
      method: "DELETE",
    }),

  // guardrails (collection)
  listGuardrails: () => apiFetch<GuardrailRead[]>(`${ADMIN}/guardrails`),
  getGuardrail: (id: string) =>
    apiFetch<GuardrailRead>(`${ADMIN}/guardrails/${id}`),
  createGuardrail: (body: GuardrailCreate) =>
    apiFetch<MutationResponse<GuardrailRead>>(`${ADMIN}/guardrails`, {
      method: "POST",
      body: j(body),
    }),
  patchGuardrail: (id: string, body: GuardrailPatch) =>
    apiFetch<MutationResponse<GuardrailRead>>(`${ADMIN}/guardrails/${id}`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteGuardrail: (id: string) =>
    apiFetch<MutationResponse<DeleteResult>>(`${ADMIN}/guardrails/${id}`, {
      method: "DELETE",
    }),

  // prompts (collection, append-only versioned)
  listPrompts: () => apiFetch<PromptRead[]>(`${ADMIN}/prompts`),
  getPrompt: (id: string) => apiFetch<PromptRead>(`${ADMIN}/prompts/${id}`),
  createPrompt: (body: PromptCreate) =>
    apiFetch<MutationResponse<PromptRead>>(`${ADMIN}/prompts`, {
      method: "POST",
      body: j(body),
    }),
  patchPrompt: (id: string, body: PromptPatch) =>
    apiFetch<MutationResponse<PromptRead>>(`${ADMIN}/prompts/${id}`, {
      method: "PATCH",
      body: j(body),
    }),
  deletePrompt: (id: string) =>
    apiFetch<MutationResponse<DeleteResult>>(`${ADMIN}/prompts/${id}`, {
      method: "DELETE",
    }),

  // integrations (collection)
  listIntegrations: () => apiFetch<IntegrationRead[]>(`${ADMIN}/integrations`),
  getIntegration: (id: string) =>
    apiFetch<IntegrationRead>(`${ADMIN}/integrations/${id}`),
  createIntegration: (body: IntegrationCreate) =>
    apiFetch<MutationResponse<IntegrationRead>>(`${ADMIN}/integrations`, {
      method: "POST",
      body: j(body),
    }),
  patchIntegration: (id: string, body: IntegrationPatch) =>
    apiFetch<MutationResponse<IntegrationRead>>(
      `${ADMIN}/integrations/${id}`,
      { method: "PATCH", body: j(body) },
    ),
  deleteIntegration: (id: string) =>
    apiFetch<MutationResponse<DeleteResult>>(`${ADMIN}/integrations/${id}`, {
      method: "DELETE",
    }),

  // engine-backed session history (chat hydration & sidebar listing)
  listAgentSessions: () =>
    apiFetch<AgentSessionSummary[]>("/agent/sessions"),
  getAgentSession: (id: string) =>
    apiFetch<AgentSessionDetail>(`/agent/sessions/${encodeURIComponent(id)}`),
  getAgentCapabilities: () =>
    apiFetch<AgentCapabilities>("/agent/capabilities"),

  // onboarding wizard
  scan: () =>
    apiFetch<ScanResponse>(`${ADMIN}/onboarding/scan`, {
      method: "POST",
    }),
  createFromDetection: (body: CreateFromDetectionBody) =>
    apiFetch<MutationResponse<AgentRead>>(
      `${ADMIN}/onboarding/create-from-detection`,
      { method: "POST", body: j(body) },
    ),
  createStarter: (body: CreateStarterBody) =>
    apiFetch<MutationResponse<AgentRead>>(`${ADMIN}/onboarding/create-starter`, {
      method: "POST",
      body: j(body),
    }),
};
