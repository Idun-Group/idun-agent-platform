/**
 * Typed fetch wrappers for the standalone admin API.
 *
 * - All requests send credentials so the session cookie travels with them.
 * - 401 responses redirect to /login/ once (not in a tight loop).
 * - Errors are thrown as ApiError so TanStack Query can surface them.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`API ${status}`);
  }
}

let redirected = false;
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    redirected = true;
    window.location.href = "/login/";
    throw new ApiError(401, null);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

const j = (body: unknown) => JSON.stringify(body);

export type Singleton<T> = { config: T; enabled?: boolean };

export const api = {
  // auth
  login: (password: string) =>
    apiFetch<{ ok: boolean }>("/admin/api/v1/auth/login", {
      method: "POST",
      body: j({ password }),
    }),
  logout: () =>
    apiFetch<{ ok: boolean }>("/admin/api/v1/auth/logout", { method: "POST" }),
  me: () =>
    apiFetch<{ authenticated: boolean; auth_mode: string }>(
      "/admin/api/v1/auth/me",
    ),

  // agent
  getAgent: () => apiFetch<AgentRead>("/admin/api/v1/agent"),
  putAgent: (body: AgentUpdate) =>
    apiFetch<AgentRead>("/admin/api/v1/agent", { method: "PUT", body: j(body) }),
  forceReload: () =>
    apiFetch<unknown>("/admin/api/v1/agent/reload", { method: "POST" }),

  // singletons
  getGuardrails: () =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/guardrails"),
  putGuardrails: (body: Singleton<unknown>) =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/guardrails", {
      method: "PUT",
      body: j(body),
    }),
  getMemory: () => apiFetch<Singleton<unknown>>("/admin/api/v1/memory"),
  putMemory: (body: Singleton<unknown>) =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/memory", {
      method: "PUT",
      body: j(body),
    }),
  getObservability: () =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/observability"),
  putObservability: (body: Singleton<unknown>) =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/observability", {
      method: "PUT",
      body: j(body),
    }),
  getTheme: () => apiFetch<Singleton<unknown>>("/admin/api/v1/theme"),
  putTheme: (body: Singleton<unknown>) =>
    apiFetch<Singleton<unknown>>("/admin/api/v1/theme", {
      method: "PUT",
      body: j(body),
    }),

  // collections
  listMcp: () => apiFetch<McpRead[]>("/admin/api/v1/mcp-servers"),
  createMcp: (body: McpCreate) =>
    apiFetch<McpRead>("/admin/api/v1/mcp-servers", {
      method: "POST",
      body: j(body),
    }),
  patchMcp: (id: string, body: Partial<McpRead>) =>
    apiFetch<McpRead>(`/admin/api/v1/mcp-servers/${id}`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteMcp: (id: string) =>
    apiFetch<void>(`/admin/api/v1/mcp-servers/${id}`, { method: "DELETE" }),

  listPrompts: () => apiFetch<PromptRead[]>("/admin/api/v1/prompts"),
  createPrompt: (body: { prompt_key: string; content: string; tags: string[] }) =>
    apiFetch<PromptRead>("/admin/api/v1/prompts", {
      method: "POST",
      body: j(body),
    }),
  deletePrompt: (id: string) =>
    apiFetch<void>(`/admin/api/v1/prompts/${id}`, { method: "DELETE" }),

  listIntegrations: () => apiFetch<IntegrationRead[]>("/admin/api/v1/integrations"),
  createIntegration: (body: IntegrationCreate) =>
    apiFetch<IntegrationRead>("/admin/api/v1/integrations", {
      method: "POST",
      body: j(body),
    }),
  patchIntegration: (id: string, body: Partial<IntegrationRead>) =>
    apiFetch<IntegrationRead>(`/admin/api/v1/integrations/${id}`, {
      method: "PATCH",
      body: j(body),
    }),
  deleteIntegration: (id: string) =>
    apiFetch<void>(`/admin/api/v1/integrations/${id}`, { method: "DELETE" }),

  // traces
  listSessions: (params: { limit?: number; offset?: number } = {}) =>
    apiFetch<{ items: SessionSummary[]; total: number }>(
      `/admin/api/v1/traces/sessions?limit=${params.limit ?? 50}&offset=${
        params.offset ?? 0
      }`,
    ),
  getSessionEvents: (id: string) =>
    apiFetch<{ events: TraceEvent[]; truncated: boolean }>(
      `/admin/api/v1/traces/sessions/${id}/events`,
    ),
  deleteSession: (id: string) =>
    apiFetch<void>(`/admin/api/v1/traces/sessions/${id}`, { method: "DELETE" }),
};

// — Types ---------------------------------------------------------------

export type AgentRead = {
  id: string;
  name: string;
  framework: string;
  graph_definition: string;
  config: Record<string, unknown>;
};
export type AgentUpdate = Omit<AgentRead, "id">;

export type McpRead = {
  id: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
};
export type McpCreate = Omit<McpRead, "id">;

export type PromptRead = {
  id: string;
  prompt_key: string;
  version: number;
  content: string;
  tags: string[];
};

export type IntegrationRead = {
  id: string;
  kind: string;
  config: Record<string, unknown>;
  enabled: boolean;
};
export type IntegrationCreate = Omit<IntegrationRead, "id">;

export type SessionSummary = {
  id: string;
  created_at: string;
  last_event_at: string;
  message_count: number;
  title: string | null;
};

export type TraceEvent = {
  id: number;
  session_id: string;
  run_id: string;
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};
