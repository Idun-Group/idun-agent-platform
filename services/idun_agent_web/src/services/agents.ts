import { getJson, postJson, putJson, patchJson, deleteRequest } from '../utils/api';

const USE_MOCKS = (import.meta as any)?.env?.VITE_USE_MOCKS === 'true';

const mockAgents: BackendAgent[] = Array.from({ length: 8 }).map((_, i) => {
    const frameworks: AgentFramework[] = ['langgraph', 'langchain', 'autogen', 'crewai', 'custom'];
    const statuses: AgentStatus[] = ['draft', 'ready', 'deployed', 'running', 'stopped', 'error'];
    const now = new Date();
    const created = new Date(now.getTime() - (i + 1) * 86400000);
    const updated = new Date(created.getTime() + 3600000 * (i + 1));
    return {
        id: `mock-agent-${i + 1}`,
        name: `Mock Agent ${i + 1}`,
        description: i % 2 === 0 ? `This is a mock agent number ${i + 1}` : null,
        framework: frameworks[i % frameworks.length],
        status: statuses[i % statuses.length],
        config: null,
        engine_config: null,
        run_config: { env: { LANGFUSE_HOST: 'https://cloud.langfuse.com' } },
        created_at: created.toISOString(),
        updated_at: updated.toISOString(),
    } as BackendAgent;
});

export type AgentFramework = 'langgraph' | 'langchain' | 'autogen' | 'crewai' | 'custom';
export type AgentStatus = 'draft' | 'ready' | 'deployed' | 'running' | 'stopped' | 'error';

export interface BackendAgent {
    id: string;
    name: string;
    description?: string | null;
    framework: AgentFramework;
    status: AgentStatus;
    config?: Record<string, unknown> | null;
    engine_config?: Record<string, unknown> | null;
    run_config?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface AgentCreatePayload {
    name: string;
    description?: string;
    config: {
        agent: {
            type: AgentFramework | 'custom';
            config: Record<string, unknown>;
        };
    };
}

export type AgentReplacePayload = AgentCreatePayload;

export interface AgentPatchPayload {
    name?: string;
    description?: string;
    config?: AgentCreatePayload['config'];
}

export interface ListAgentsParams {
    limit?: number;
    offset?: number;
    sort_by?: 'name' | 'description' | 'framework' | 'status' | 'created_at' | 'updated_at';
    order?: 'asc' | 'desc';
}

export function listAgents(params: ListAgentsParams = {}): Promise<BackendAgent[]> {
    if (USE_MOCKS) {
        const sorted = [...mockAgents].sort((a, b) =>
            (params.order || 'desc') === 'asc'
                ? a.created_at.localeCompare(b.created_at)
                : b.created_at.localeCompare(a.created_at)
        );
        const offset = params.offset ?? 0;
        const limit = params.limit ?? sorted.length;
        return Promise.resolve(sorted.slice(offset, offset + limit));
    }
    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.order) query.set('order', params.order);
    const qs = query.toString();
    const path = `/api/v1/agents${qs ? `?${qs}` : ''}`;
    return getJson<BackendAgent[]>(path).catch(() => {
        // Fallback to mocks if backend is unavailable
        const sorted = [...mockAgents].sort((a, b) =>
            (params.order || 'desc') === 'asc'
                ? a.created_at.localeCompare(b.created_at)
                : b.created_at.localeCompare(a.created_at)
        );
        const offset = params.offset ?? 0;
        const limit = params.limit ?? sorted.length;
        return sorted.slice(offset, offset + limit);
    });
}

export function getAgent(agentId: string): Promise<BackendAgent> {
    if (USE_MOCKS) {
        const found = mockAgents.find((a) => a.id === agentId) || mockAgents[0];
        return Promise.resolve(found);
    }
    return getJson<BackendAgent>(`/api/v1/agents/${agentId}`).catch(() => {
        return mockAgents.find((a) => a.id === agentId) || mockAgents[0];
    });
}

export function createAgent(payload: AgentCreatePayload): Promise<BackendAgent> {
    return postJson<BackendAgent, AgentCreatePayload>('/api/v1/agents', payload);
}

export function updateAgent(agentId: string, payload: AgentReplacePayload): Promise<BackendAgent> {
    return putJson<BackendAgent, AgentReplacePayload>(`/api/v1/agents/${agentId}`, payload);
}

export function patchAgent(agentId: string, payload: AgentPatchPayload): Promise<BackendAgent> {
    return patchJson<BackendAgent, AgentPatchPayload>(`/api/v1/agents/${agentId}`, payload);
}

export async function deleteAgent(agentId: string): Promise<void> {
    if (USE_MOCKS) {
        // no-op for mocks
        return;
    }
    await deleteRequest(`/api/v1/agents/${agentId}`);
}


